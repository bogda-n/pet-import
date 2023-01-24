const path = require("path")
const fs = require("fs-extra")

module.exports.readJson = function () {
  const inputFile = path.resolve(__dirname, '../input/export.json')
  const filesObject = fs.readFileSync(inputFile, {
    encoding: 'utf8',
    flag: 'r'
  })
  const jsonObject = JSON.parse(filesObject)
  return jsonObject
}