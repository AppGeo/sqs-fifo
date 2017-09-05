const aws = require('aws-sdk')
const crypto = require('crypto')
const stringify = require('json-stable-stringify')
const debug = require('debug')('sqs:main')
const SQSmsg = require('./msg');
class SQS {
  constructor (config) {
    if (typeof config === 'string') {
      config = {
        name: config
      }
    }
    var awsConfig = {}
    if (config.access && config.secret) {
      awsConfig.accessKeyId = config.access
      awsConfig.secretAccessKey = config.secret
    }
    awsConfig.region = config.region || 'us-east-2'
    this.sqs = new aws.SQS(awsConfig)
    this.defaultVisabilityTimeout = config.visibilityTimeout || 60 * 5// 5 min
    this.queueUrl = this.getQueueUrl(config.name)
    this.stopped = false
    this.running = false
  }
  getQueueUrl (name) {
    if (!name.endsWith('.fifo')) {
      name = name += '.fifo'
    }
    return this.checkQueue(name).catch(() => {
      return this.createQueue(name)
    })
  }
  checkQueue (name) {
    return new Promise((resolve, reject) => {
      this.sqs.getQueueUrl({
        QueueName: name
      }, (err, data) => {
        if (err) {
          debug('setQueueUrl err')
          return reject(err)
        }
        if (data && data.QueueUrl) {
          return resolve(data.QueueUrl)
        }
        return reject(new Error('nothing returned'))
      })
    })
  }
  createQueue (name) {
    return new Promise((resolve, reject) => {
      const config = {
        QueueName: name,
        Attributes: {
          FifoQueue: 'true',
          ContentBasedDeduplication: 'true',
          VisibilityTimeout: String(this.defaultVisabilityTimeout)
        }
      }
      this.sqs.createQueue(config, (err, resp) => {
        if (err) {
          debug('createQueue error')
          return reject(err)
        }
        resolve(resp.QueueUrl)
      })
    })
  }
  push (data, groupID) {
    groupID = groupID || crypto.randomBytes(64).toString('hex')
    return this.queueUrl.then(url => {
      const params = {
        MessageBody: stringify(data),
        QueueUrl: url,
        MessageGroupId: groupID
      }
      return new Promise((resolve, reject) => {
        this.sqs.sendMessage(params, err => {
          if (err) {
            debug('push error')
            return reject(err)
          }
          resolve()
        })
      })
    })
  }
  pull () {
    if (this.inflight) {
      return this.inflight
    }
    this.inflight = this.queueUrl.then(url => {
      const params = {
        QueueUrl: url,
        WaitTimeSeconds: 20
      }
      return new Promise((resolve, reject) => {
        this.sqs.receiveMessage(params, (err, data) => {
          if (err) {
            debug('pull err')
            return reject(err)
          }
          const msgs = data.Messages
          if (!msgs || !msgs.length) {
            return reject(new Error('no messages'))
          }

          resolve(new SQSmsg(msgs[0], this))
        })
      })
    }).then(data => {
      this.inflight = null
      return data
    }, err => {
      this.inflight = null
      throw err
    })
    return this.inflight
  }
  awk (rcpt) {
    debug('awk')
    return this.queueUrl.then(url => {
      const params = {
        QueueUrl: url,
        ReceiptHandle: rcpt,
        VisibilityTimeout: this.defaultVisabilityTimeout
      }
      return new Promise((resolve, reject) => {
        this.sqs.changeMessageVisibility(params, err => {
          if (err) {
            debug('changeMessageVisibility err')
            return reject(err)
          }
          resolve()
        })
      })
    })
  }
  stop () {
    this.stopped = true
  }
  run (handler, recursive) {
    if (this.running) {
      if (!recursive) {
        return
      }
    } else {
      this.running = true
    }
    if (this.stopped) {
      this.running = false
      this.stopped = false
      return
    }
    return this.pull().then(data => {
      return Promise.resolve(handler(data)).then(resp => {
        if (resp) {
          return Promise.all([
            this.push(resp),
            data.done()
          ])
        }
        return data.done()
      })
    }).then(() => {
      return this.run(handler, true)
    },
    e => {
      if (e.message !== 'no messages') {
        debug('run error')
        debug(e)
      }
      return this.run(handler, true)
    })
  }
  done (rcpt) {
    debug('done')
    return this.queueUrl.then(url => {
      const params = {
        QueueUrl: url,
        ReceiptHandle: rcpt
      }
      return new Promise((resolve, reject) => {
        this.sqs.deleteMessage(params, err => {
          if (err) {
            debug('delete msg err')
            return reject(err)
          }
          resolve()
        })
      })
    })
  }
}
module.exports = SQS
