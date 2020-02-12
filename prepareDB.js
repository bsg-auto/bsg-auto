const mongoose = require('mongoose')
/**
 * Created on 1398/11/20 (2020/2/9).
 * @author {@link https://mirismaili.github.io S. Mahdi Mir-Ismaili}
 */
'use strict'

mongoose.set('useNewUrlParser', true)
mongoose.set('useFindAndModify', false)
mongoose.set('useCreateIndex', true)
mongoose.set('useUnifiedTopology', true)
mongoose.set('runValidators', true)
const Schema = mongoose.Schema

const dbConnectPromise = mongoose.connect(process.env.DB_URI || 'mongodb://localhost/bashgah-auto')
const db = mongoose.connection

db.on('error', console.error.bind(console, 'DB ERROR:'))

// noinspection JSUnusedGlobalSymbols
const UserSchema = new Schema({
	name: {type: String, index: true},
	username: {type: String, unique: true, required: true},
	encryptedPassword: {type: Buffer, validate: value => value !== null, default: null},  // Why not `required: true`? https://github.com/Automattic/mongoose/issues/8580
	passwordIsValid: {type: Boolean, required: true, default: true},
	entity: {
		firstLoginState: Boolean,
		isMergeWindowVisibleForNewCustomer: Boolean,
		user: {
			clubId: String,
			firstLoginState: Boolean,
			email: String,
			customerTitle: String,
			isCustomer: Boolean,
			ccmsMemberType: Number,
			reagentRegistrationState: Number,
			clubMemberCode: String,
			aggreeToDepositMoney: Boolean,
			aggreeToDepositMoneyDate: Date,
			isMarketer: Boolean,
			BlogEncData: String,
			UnreadPopupPublicMessageCount: Number,
			UnreadPopupPrivateMessageCount: Number,
			HasStateCenter: Boolean,
		},
		level: {
			title: String,
			score: Number,
			remainingRial: Number,
			totalRial: Number,
			credit: Number,
			order: Number,
		},
	}
})

UserSchema.pre('updateOne', function (next) {
	this.options.setDefaultsOnInsert = true
	next()
})

const User = db.model('users', UserSchema)
User.on('index', err => console.warn('Disable `autoIndex` on production mode. See:', 'https://mongoosejs.com/docs/guide.html#indexes'))

module.exports = {
	dbConnectPromise,
	UserSchema,
	User,
}
