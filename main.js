const fs = require('fs')
const http = require('http')
const Jimp = require('jimp')
const Axios = require('axios').default
const tf = require('@tensorflow/tfjs-node')
const {JSDOM} = require('jsdom')
const mkdirp = require('mkdirp')

const {
	parseSetCookies,
	setCookiesToCookies,
	stringifyCookies,
	getImagesDataset,
} = require('./functions')
const {
	NUM_DIGITS_PER_IMAGE,
	DIGIT_WIDTH,
	DIGIT_HEIGHT,
	DIGIT_SIZE,
	httpStatusCodes,
} = require('./values')
const {
	dbConnectPromise,
	User,
} = require('./prepareDB')

/**
 * Created on 1398/11/17 (2020/2/6).
 * @author {@link https://mirismaili.github.io S. Mahdi Mir-Ismaili}
 */
'use strict'

const axios = Axios.create({
	baseURL: 'https://bashgah.com',
	timeout: 15000,
	maxRedirects: 0,
	withCredentials: true,
})
//***************************************************************************************/
const credentialsPromise = new Promise(async resolve => {
	await dbConnectPromise
	resolve(await User.find().select('username password -_id'))
})
let model = null
let modelPromise = tf.loadLayersModel('file://./trained-models/bashgah-captcha@1398-11-17@10073.json')

async function postAnswers(username, password, qaPairs) {
	let response = await axios.get(`/Account/CaptchaImage?id=${Date.now()}`, {
		responseType: 'stream',
		// headers: {
		// 	'Host': 'bashgah.com',
		// 	'Connection': 'keep-alive',
		// 	'Cache-Control': 'max-age=0',
		// 	'Upgrade-Insecure-Requests': '1',
		// 	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36',
		// 	'Sec-Fetch-User': '?1',
		// 	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
		// 	'Sec-Fetch-Site': 'none',
		// 	'Sec-Fetch-Mode': 'navigate',
		// 	'Accept-Encoding': 'gzip, deflate, br',
		// 	'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
		// },
	})
	
	console.log(response.status, response.statusText)
	//console.log(response.headers)
	// console.log(response.data.toString('hex'))
	//console.log(response.config)
	
	let cookies = parseSetCookies(response.headers['set-cookie'])
	const resDataStream = response.data
	
	// Write image to file:
	// const defPath = `downloaded-captcha-${id}.png`
	// resDataStream.pipe(fs.createWriteStream(defPath))
	
	// Convert the stream to array-buffer:
	const chunks = []
	for await (let chunk of resDataStream) chunks.push(chunk)
	
	const image = await Jimp.read(Buffer.concat(chunks))
	const rawData = image.bitmap.data
	
	const imagesDataset = getImagesDataset(rawData)
	
	const xs = tf.tensor2d(imagesDataset, [NUM_DIGITS_PER_IMAGE, DIGIT_SIZE])
	//xs.print('verbose')
	
	if (!model) model = await modelPromise
	const prediction = model.predict(xs.reshape([NUM_DIGITS_PER_IMAGE, DIGIT_HEIGHT, DIGIT_WIDTH, 1]))
	const preds = prediction.argMax([-1])
	const predsAr = preds.arraySync()
	
	const answer = predsAr.join('')
	console.log('resolved:', answer, username)
	
	response = await axios.post('/Account/Authenticate', {
		UserName: username,
		Password: password,
		CaptchaCode: answer,
	}, {
		headers: {
			// 'Host': 'bashgah.com',
			// 'Connection': 'keep-alive',
			// 'Accept': 'application/json, text/plain, */*',
			// 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36',
			// 'Content-Type': 'application/json;charset=UTF-8',
			// 'Origin': 'https://bashgah.com',
			// 'Sec-Fetch-Site': 'same-origin',
			// 'Sec-Fetch-Mode': 'cors',
			// 'Referer': 'https://bashgah.com/',
			// 'Accept-Encoding': 'gzip, deflate, br',
			// 'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
			'Cookie': stringifyCookies(setCookiesToCookies(cookies)),
		},
	})
	
	console.log(response.status, '/', response.statusText)
	//console.log(response.headers)
	
	if (response.data.success !== true) {
		switch (response.data.error) {
			case 'کد امنیتی صحیح نیست':
				return 'retry'
			case 'نام کاربری یا کلمه عبور اشتباه است':
				return 'wrong-credential'
			default:
				console.error('Unexpected error!', response.data)
				return 'unexpected-error'
		}
	}
	const userInfo = {entity: response.data.Entity, level: response.data.level}
	const date = userInfo.entity.user.aggreeToDepositMoneyDate
	userInfo.entity.user.aggreeToDepositMoneyDate = date.substring(6, date.length - 2)  // convert "/Date(###)/" to "###"
	
	cookies = cookies.concat(parseSetCookies(response.headers['set-cookie']))
	// console.log(cookies)
	// console.log(setCookiesToCookies(cookies))
	// console.log(stringifyCookies(setCookiesToCookies(cookies)))
	
	for (const qa of qaPairs) {
		response = await axios.post('/Competition/AnswerToQuestion', {
			GambleScore: '',
			AnswerOptionId: qa.answerId,
			QuestionId: qa.questionId,
		}, {
			headers: {
				'Cookie': stringifyCookies(setCookiesToCookies(cookies)),
			},
		})
		console.log(response.status + '#' + response.statusText)
		
		if (!response.data.success)
			console.error(username, response.data.error || response.data)
		
		qa.resData = (response.data)
	}
	
	return {userInfo, qaPairs}
}

async function serve(req, res, reqBodyStr) {
	let reqBody
	try {
		// noinspection JSCheckFunctionSignatures
		reqBody = JSON.parse(reqBodyStr)
	} catch (error) {
		console.error('request body:\n', JSON.stringify(reqBodyStr))
		// noinspection ExceptionCaughtLocallyJS
		throw error
	}
	console.log(reqBody)
	
	const qaPairs = reqBody.qaPairs || []
	const newCredentials = reqBody.credentials || {}
	
	// Complete qaPairs info (add questionId and answerId)
	for (const qa of qaPairs) {
		const urlPath = `/Question/${qa.questionNumber}/`
		const response = await axios.get(urlPath, {
			responseType: 'document',
		})
		
		const html = response.data
		try {
			const dom = new JSDOM(html)
			const document = dom.window.document
			
			const buttons = document.getElementsByClassName('btn')
			const sendAnswerBtn = buttons[4]
			const answerChoice = buttons[qa.answerNumber - 1]
			
			if (sendAnswerBtn === undefined)
			// noinspection ExceptionCaughtLocallyJS
				throw new Error(`The question ${qa.questionNumber} has been expired! ${axios.defaults.baseURL + urlPath}`)
			
			let attribute = sendAnswerBtn.getAttribute('ng-click')
			qa.questionId = attribute.match(/(?<=vm\.answerToQuestion\(').+?(?=')/)[0]
			
			attribute = answerChoice.getAttribute('ng-style')
			qa.answerId = attribute.match(/(?<=\(Answer == ').+?(?=')/)[0]
		} catch (error) {
			try {
				new Promise(async (resolve, reject) => {
					await mkdirp('logs')
					fs.writeFile(`logs/${qa.questionNumber}.html`, html, err => {
						if (err) return reject(err)
						resolve()
					})
				})
			} catch (err) {
				console.error('Error in writing html to file:\n', err, `\n${html}`)
			}
			
			throw error
		}
	}
	console.log(qaPairs)
	
	const results = {}
	const qaResults = {}
	let postAnswersPromises = []
	await dbConnectPromise
	for (const username in newCredentials) {
		postAnswersPromises.push(new Promise(async (resolve, reject) => {
			try {
				while ((results[username] =
								await postAnswers(username, newCredentials[username].password, qaPairs.slice())
				) === 'retry') {
				}
				qaResults[username] = results[username].qaPairs
				
				if (results[username] === 'wrong-credential') return resolve()
				
				console.log('New correct credential:', username)
				const {userInfo} = results[username]
				const newUserData = {
					name: userInfo.entity.user.customerTitle,
					username,
					password: newCredentials[username].password,
					...userInfo,
				}
				
				User.findOneAndUpdate({username}, newUserData, {new: true, upsert: true}).then(user => {
					console.log('Upserted successfully:', user.username)
				}).catch(console.error.bind(console, 'Upsert Error:'))
				
				resolve()
			} catch (err) {
				reject(err)
			}
		}))
	}
	
	await Promise.all(postAnswersPromises)
	
	postAnswersPromises = []
	const credentials = await credentialsPromise
	for (const credential of credentials) {
		const username = credential.username
		
		if (results[username] !== undefined) continue
		
		postAnswersPromises.push(new Promise(async (resolve, reject) => {
			try {
				while ((results[username] =
								await postAnswers(username, credential.password, qaPairs.slice())
				) === 'retry') {
				}
				qaResults[username] = results[username].qaPairs
				
				if (results[username] !== 'wrong-credential') return resolve()
				
				console.log('A WRONG credential:', username)
				
				User.deleteOne({username}).then(_ => {
					console.log('Deleted successfully:', username)
				}).catch(console.error.bind(console, 'Error during deleting from DB:'))
				
				resolve()
			} catch (err) {
				reject(err)
			}
		}))
	}
	await Promise.all(postAnswersPromises)
	
	res.writeHead(httpStatusCodes.OK, {
		'Content-Type': 'application/json; charset=utf-8'
	})
	res.end(JSON.stringify(qaResults), 'utf-8')
}

const MAX_RETRY_TIMES = 2
const MAX_RETRY_ON_TIMEOUTS = 5

async function parseRequest(req) {
	console.log(req.method, req.url)
	// console.log(clientReq.headers)
	// console.log(req.headers)
	
	// const cookies = parseCookies(req.headers['Cookie'] || '')
	// console.log(cookies)
	
	// noinspection UnnecessaryLocalVariableJS
	const body = await new Promise(resolve => {
		let data = []
		req
				.on('data', chunk => data.push(chunk))
				.on('end', () => resolve(Buffer.concat(data).toString()))
	}) || process.env.SIMULATED_POST_DATA || ''
	
	return {body}
}

const onRequest = async (req, res) => {
	const {body} = await parseRequest(req)
	
	let tryNumber = 1
	while (true) {
		console.log('Try Number:', tryNumber)
		try {
			await serve(req, res, body)
			break
		} catch (err) {
			console.error('ERROR!', req.url)
			console.error(err)
			
			if (res.writableEnded) break
			
			if (err.message.startsWith('getaddrinfo ENOTFOUND') && tryNumber < MAX_RETRY_ON_TIMEOUTS ||
					tryNumber < MAX_RETRY_TIMES) {
				tryNumber++
				continue
			}
			res.writeHead(httpStatusCodes.INTERNAL_SERVER_ERROR, {
				'Content-Type': 'text/html; charset=utf-8'
			})
			res.end(
					`<h1>${err.name}</h1>` +
					`<p>${err.message}</p>` +
					`<p>${req.url}</p>` +
					`<pre>${err.stack}</pre>`,
					'utf-8')
			break
		}
	}
}

const PORT = process.env.PORT || 5000

http.createServer(onRequest).listen(PORT)
console.log(`Listening on port ${PORT} ...`)
