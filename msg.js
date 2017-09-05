const debug = require('debug')('sqs:msg')

class SQSmsg {
  constructor (msg, sqs) {
    this.sqs = sqs
    this.rcpt = msg.ReceiptHandle
    this.body = JSON.parse(msg.Body)
    debug(this.body)
    this.isDone = false
    this.awkInProgress = false
  }
  awk () {
    if (this.awkInProgress) {
      return Promise.resolve(false)
    }
    if (this.isDone) {
      return Promise.resolve()
    }
    this.awkInProgress = true
    return this.sqs.awk(this.rcpt).then(item => {
      this.awkInProgress = false
      return item
    },
    item => {
      this.awkInProgress = false
      throw item
    })
  }
  done () {
    if (this.isDone) {
      return Promise.resolve()
    }
    this.isDone = true
    return this.sqs.done(this.rcpt)
  }
}
module.exports = SQSmsg;
