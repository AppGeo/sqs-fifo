sqs-fifo
=====

Library for using an aws sqs queue in fifo mode.

API
===

Constructor
----

accessKeyId and secretAccessKey can be specified via environmental variables.
Not all regions support fifo queues so defaults to one that does, only mandatory field is name.  

```js
const queue = new Sqs({
  accessKeyId: 'string',
  secretAccessKey: 'string',
  name: 'queuename',
  region: 'us-east-2' // default,
  visibilityTimeout: 300 // default
})
```

Methods
---

```js
queue.push({
  some: 'object',
  stringifable: 'to json'
}).then(()=> {
  // successfully put in the queue
}, e=> {
  // error if we failed
})
```

push also accepts an optional group id as a second param.

```js
queue.pull().then(data => {
  // data is a Msg object which we'll discuss bellow
}, e => {
  // error if something bad happened
})
```

you probably won't need pull as you'll probably want to use this next one

```js
queue.run(data => {
  // do stuff
})
```

run works by

1. getting called with a handler
2. calling pull and when it resolves calling handler with the data
3. if the function returns a promise, resolve it and if it errors, go back to step 2.
4. if it returns any data, enqueue that as a new task in the queue.
5. call done on the message.

note it does not enforce a timeout on the messages, so if you're afraid your function might hang you need to handle that yourself

```js
queue.stop();
```

stops the queue from from running, does not return a promise.

Msg
===

The msg object is what returns data for us, it has

- a `body` property that has the parsed json of the message
- an `awk()` method which returns a promise and you need to call if you need to extend the timeout to let the queue know that you are still processing the data and haven't errored out.  If you fail to call this the message will go back into the stack.
- a `done()` method which returns a promise that you need to call to say you are done processing some data and it can be removed from the queue.  You don't need to call this if using the run method on the queue.
