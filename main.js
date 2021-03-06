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
	headersKeysToLowerCase,
	writeHeadAndEnd,
	writeHeadAndEndJson,
	basicAuthParser,
} = require('./functions')
const {
	NUM_DIGITS_PER_IMAGE,
	DIGIT_WIDTH,
	DIGIT_HEIGHT,
	DIGIT_SIZE,
	HTTP_STATUS,
} = require('./values')
const {
	dbConnectPromise,
	User,
} = require('./prepareDB')
const {
	Aes,
	getExternalIP,
} = require('./utils')

/**
 * Created on 1398/11/17 (2020/2/6).
 * @author {@link https://mirismaili.github.io S. Mahdi Mir-Ismaili}
 */
'use strict'
const env = process.env
const aes = new Aes(Buffer.from(env.AES_KEY, 'hex'), 7)
//***************************************************************************************/

const axios = Axios.create({
	baseURL: 'https://bashgah.com',
	timeout: 15000,
	maxRedirects: 0,
	withCredentials: true,
})
//***************************************************************************************/

getExternalIP().then(console.log.bind(console, 'Public IP:')).catch(console.error.bind(console))
//***************************************************************************************/

let model = null
let modelPromise = tf.loadLayersModel('file://./trained-models/bashgah-captcha@1398-11-17@10073.json')

async function postAnswers(username, password, qaPairs) {
	const MAX_TRIES = 5
	let tries = 0
	while (tries < MAX_TRIES) {
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
		// const defPath = `downloaded-captcha-${username}.png`
		// resDataStream.pipe(fs.createWriteStream(defPath))
		
		// Convert the stream to array-buffer:
		const chunks = []
		for await (let chunk of resDataStream) chunks.push(chunk)
		
		const buffer = Buffer.concat(chunks)
		const image = await Jimp.read(buffer)
		const bitmap = image.bitmap.data
		
		const imagesDataset = getImagesDataset(bitmap)
		
		const xs = tf.tensor2d(imagesDataset, [NUM_DIGITS_PER_IMAGE, DIGIT_SIZE])
		//xs.print('verbose')
		
		if (!model) model = await modelPromise
		const prediction = model.predict(xs.reshape([NUM_DIGITS_PER_IMAGE, DIGIT_HEIGHT, DIGIT_WIDTH, 1]))
		// noinspection JSCheckFunctionSignatures
		const preds = prediction.argMax([-1])
		const predsAr = preds.arraySync()
		
		const answer = predsAr.join('')
		console.log('resolved captcha:', answer, username)
		
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
					console.log(tries++, answer, buffer.toString('base64'))
					continue  // retry
				case 'نام کاربری یا کلمه عبور اشتباه است':
					console.error('WRONG-CREDENTIAL', username, password)
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
	
	console.error('max-captcha-reading-tries-exceeded')
	return 'max-captcha-reading-tries-exceeded'
}

async function serve(req, res, reqBodyStr) {
	if (!reqBodyStr)
		return writeHeadAndEnd(res, {
			status: HTTP_STATUS.BAD_REQUEST,
			statusMessage: 'Bad Request! No body provided.'
		})
	
	let reqBody
	try {
		reqBody = JSON.parse(reqBodyStr)
	} catch (error) {
		console.log('request body:\n', reqBodyStr)
		return writeHeadAndEnd(res, {
			status: HTTP_STATUS.BAD_REQUEST,
			statusMessage: 'Bad Request! Body\'s not in JSON format.'
		})
	}
	console.log(reqBody)
	//********************************************************************************/
	
	const credentialsPromise = new Promise(async resolve => {
		await dbConnectPromise
		resolve(await User.find({passwordIsValid: true}).select('username encryptedPassword -_id'))
	})
	
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
				results[username] = await postAnswers(username, newCredentials[username].password, qaPairs.slice())
				
				qaResults[username] = results[username].qaPairs
				
				if (results[username] === 'wrong-credential') return resolve()
				
				console.log('New correct credential:', username)
				const {userInfo} = results[username]
				const newUserData = {
					name: userInfo.entity.user.customerTitle,
					username,
					passwordIsValid: true,
					encryptedPassword: Buffer.from(aes.encrypt(newCredentials[username].password)),
					...userInfo,
				}
				//console.log(newUserData.encryptedPassword)
				User.updateOne({username}, newUserData, {upsert: true})
						.then(console.log.bind(console, 'Upserted successfully:', username))
						.catch(console.error.bind(console, 'Upsert Error:'))
				
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
		const password = aes.decrypt(credential.encryptedPassword)
		
		if (results[username] !== undefined) continue
		
		postAnswersPromises.push(new Promise(async (resolve, reject) => {
			try {
				results[username] = await postAnswers(username, password, qaPairs.slice())

				qaResults[username] = results[username].qaPairs
				
				if (results[username] !== 'wrong-credential') return resolve()
				
				console.log('A WRONG credential:', username)
				
				User.updateOne({username}, {passwordIsValid: false})
						.then(console.log.bind(console, 'Upserted successfully:', username))
						.catch(console.error.bind(console, 'Error during deleting from DB:'))
				
				resolve()
			} catch (err) {
				reject(err)
			}
		}))
	}
	await Promise.all(postAnswersPromises)
	
	writeHeadAndEndJson(res, {data: qaResults})
}

const MAX_RETRY_TIMES = 2
const MAX_RETRY_ON_TIMEOUTS = 5

async function parseRequest(req) {
	console.log(req.method, req.url)
	// console.log(req.headers)
	
	// const cookies = parseCookies(req.headers['Cookie'] || '')
	// console.log(cookies)
	
	// noinspection UnnecessaryLocalVariableJS
	const body = await new Promise(resolve => {
		let data = []
		req
				.on('data', chunk => data.push(chunk))
				.on('end', () => resolve(Buffer.concat(data).toString()))
	})
	
	return {body}
}

const onRequest = async (req, res) => {
	headersKeysToLowerCase(req.headers)
	
	const httpCredential = basicAuthParser(req.headers.authorization, res)
	if (!httpCredential) return
	
	if (!(httpCredential.username === env.username && httpCredential.password === env.password)) {
		writeHeadAndEnd(res, {status: HTTP_STATUS.FORBIDDEN})
		return
	}
	//***************************************************************/
	
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
			writeHeadAndEnd(res, {
				status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
				data:
						`<h1>${err.name}</h1>` +
						`<p>${err.message}</p>` +
						`<p>${req.url}</p>` +
						`<pre>${err.stack}</pre>`,
			})
			break
		}
	}
}

const PORT = env.PORT || 5000

http.createServer(onRequest).listen(PORT)
console.log(`Listening on port ${PORT} ...`)
