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

const dbConnectPromise = mongoose.connect(process.env.DB_URI || 'mongodb://localhost/bashgah-auto')

mongoose.connection.on('error', console.error.bind(console, 'DB ERROR:'))

const UserSchema = new mongoose.Schema({
	name: String,
	username: {type: String, unique: true, required: true},
	password: {type: String, required: true},
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

const User = mongoose.model('User', UserSchema)

module.exports = {
	dbConnectPromise,
	UserSchema,
	User,
}
