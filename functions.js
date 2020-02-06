const  {
	IMAGE_WIDTH ,
	DIGITS_RECTS_OFFSETS,
	NUM_DIGITS_PER_IMAGE ,
	DIGITS_RECTS_TOP,
	DIGIT_ACTUAL_WIDTH,
	DIGIT_WIDTH,
	DIGIT_HEIGHT,
	DIGIT_SIZE,
} = require('./values')

/**
 * Created on 1398/11/20 (2020/2/9).
 * @author {@link https://mirismaili.github.io S. Mahdi Mir-Ismaili}
 */
'use strict'

/**
 * Parse "set-cookie"s
 * @param setCookieStrs Example: `[ 'SESSION_COOKIE=xxx; path=/; secure; HttpOnly', '...', ... ]`
 * @returns {[{}]} Example: `[ { SESSION_COOKIE: 'xxx', path: '/', secure: true, HttpOnly: true }, ... ]`
 */
const parseSetCookies = setCookieStrs =>
		setCookieStrs.map(cookieStr => {
			const entries = cookieStr.split(';')   // ['SESSION_COOKIE=xxx', ' path=/', ' secure', ' HttpOnly']
					.map(setCookiePartStr => {  // " path=/"
								const [name, value] = setCookiePartStr.split('=')  // [" path", "/"], [" secure", undefined]
								return [name.trimStart(), value === undefined ? true : value] // ["path", "/"], [" secure", true]
							}
					)
			return Object.fromEntries(entries)
		})

/**
 * 'set-cookies' obj[] to 'cookies' obj
 * @param setCookies Example: `[ { SESSION_COOKIE: 'xxx', path: '/', secure: true }, {a: 'b', c: 'd'}, ... ]`
 * @returns {{}} Example: `{ SESSION_COOKIE: 'xxx', a: 'b' }`
 */
const setCookiesToCookies = setCookies =>
		setCookies.reduce((cookies, setCookie) => {
			const entries = Object.entries(setCookie)[0]  // only first member
			cookies[entries[0]] = entries[1]
			return cookies
		}, {})

/**
 * @param cookies Example: `{ SESSION_COOKIE: 'xxx', a: 'b' }`
 * @returns {string} Example: `SESSION_COOKIE=xxx; a=b; c=d`
 */
const stringifyCookies = cookies => Object.entries(cookies).map(cookie => cookie.join('=')).join('; ')

const combineColors = (foreColor, backColor, alpha) => alpha * foreColor + (1 - alpha) * backColor

const getImagesDataset = rawData => {
	const top = DIGITS_RECTS_TOP
	const bottom = top + DIGIT_HEIGHT
	let index = 0
	const imagesDataset = new Float32Array(DIGIT_SIZE * NUM_DIGITS_PER_IMAGE)
	
	for (const left of DIGITS_RECTS_OFFSETS) {
		const right = left + DIGIT_ACTUAL_WIDTH
		const extraPixels = DIGIT_WIDTH - (right - left)
		
		for (let y = top; y < bottom; y++) {
			for (let i = 0; i < extraPixels / 2; i++) imagesDataset[index++] = 0
			
			for (let x = left; x < right; x++) {
				const redIndex = (x + y * IMAGE_WIDTH) * 4
				
				const rF = rawData[redIndex] / 255  // the Red   value of Foreground
				const gF = rawData[redIndex + 1] / 255  // the Green value of Foreground
				const bF = rawData[redIndex + 2] / 255  // the Blue  value of Foreground
				const a = rawData[redIndex + 3] / 255  // the Alpha value of Foreground
				
				// Calculate the color on a white (0xFFFFFF) background
				const r = combineColors(rF, 1, a)
				const g = combineColors(gF, 1, a)
				const b = combineColors(bF, 1, a)
				
				// Because the image is almost grayscale, we only include one channel ((r+g+b)/3):
				imagesDataset[index++] = 1 - ((r + g + b) / 3)
				// if (index < 110) {
				// 	console.log(index - 1)
				// 	console.log(x)
				// 	console.log(y)
				// 	console.log(redIndex)
				// 	console.log(rawData[redIndex])
				// 	console.log(rawData[redIndex + 1])
				// 	console.log(rawData[redIndex + 2])
				// 	console.log(rawData[redIndex + 3])
				// 	console.log(Math.round((r + g + b) / 3 * 255))
				// 	console.log('----------------------')
				// }
			}
			
			for (let i = 0; i < extraPixels / 2; i++) imagesDataset[index++] = 0
		}
	}
	return imagesDataset
}

const parseCookies = cookiesStr =>
		cookiesStr.split(';').reduce((acc, current) => {
			const [name, value] = current.split('=')
			acc[name.trimLeft()] = value
			return acc
		}, {})

module.exports = {
	parseSetCookies,
	setCookiesToCookies,
	stringifyCookies,
	combineColors,
	getImagesDataset,
	parseCookies,
}
