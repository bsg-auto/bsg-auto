const aesjs = require('aes-js')
const http = require('http')
/**
 * Created on 1398/11/22 (2020/2/11).
 * @author {@link https://mirismaili.github.io S. Mahdi Mir-Ismaili}
 */
'use strict'

class Aes {
	constructor(key, counter) {
		this.getAesCtr = () => new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(counter))
	}
	
	encrypt = text => this.getAesCtr().encrypt(aesjs.utils.utf8.toBytes(text))
	
	decrypt = encryptedData => aesjs.utils.utf8.fromBytes(this.getAesCtr().decrypt(encryptedData))
}

const getExternalIP = () => new Promise((resolve, reject) =>
		http.get({host: 'ipv4bot.whatismyipaddress.com', port: 80, path: '/'}, res => {
			if (res.statusCode !== 200) reject(`Not OK status code: ${res.statusCode}`)
			res.on('data', chunk => resolve(chunk.toString()))
		}).on('error', reject)
)

module.exports = {
	Aes,
	getExternalIP,
}
