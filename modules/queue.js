const { default: PQueue } = require("p-queue")

module.exports.queueSettings = function () {
  const queue = new PQueue({ concurrency: 1 })
  queue.on('add', () => {
    console.log(`Task is added.  Size: ${queue.size}  Pending: ${queue.pending}`)
  })
  queue.on('next', () => {
    console.log(`Task is completed.  Size: ${queue.size}  Pending: ${queue.pending}`)

  })
  queue.on('idle', () => {
    console.log('queue is clean', new Date())
  })
  return queue
}