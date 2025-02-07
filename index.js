require('dotenv').config()

const petService = require('./modules/petService')
const readInput = require('./modules/readInput')
const queueModule = require('./modules/queue')
const xlsx = require('xlsx')
const fs = require('fs-extra')
const path = require('path')

const processedProducts = []
const resultPath = path.resolve(__dirname, 'result')

async function main(productName, productData, petToken) {
  const typeOfStory = /premium/i.test(productName) ? 'Premium'
    : /amazon/i.test(productName)? 'Amazon'
    : 'Standard'

  try {
    const petLangId = await petService.getPetLanguageId(petToken, productData.lang)

    const petBrandId = await petService.getPetBrandId(petToken, productData.brand)

    const asset = await petService.getOrCreateAsset(petBrandId, productData, productName, petLangId, petToken)

    await petService.removeStory(asset, typeOfStory, petToken)

    await createStory(asset, productData, petToken, typeOfStory)
  } catch (e) {
    console.error(e)
    console.error('Error', e.response?.data)
    const reportData = {
      Brand: productData.brand,
      SKU: productData.mpn,
      Language: productData.lang,
      Status: 'Error',
      StatusCode: e.statusCode,
      StatusText: e.statusText,
      typeOfStory
    }
    processedProducts.push(reportData)
  } finally {
    await writeResult()
  }
}

async function createStory(asset, productData, petToken, typeOfStory) {

   const storyId = await petService.createStoryV2(asset.id, typeOfStory, productData.layoutId,  petToken)
  const productId = asset.products[0].id

   await petService.setComponentsToStory(storyId, productData.components, productData.layoutId, petToken)

  if (typeOfStory !== 'amazon' || typeOfStory !== 'amazon-premium') {
    await petService.changeStatus(storyId, petToken, 'completed')
  }
  // const assetProduct = await petService.getAssetProduct(asset.id, petToken)

  const reportData = {
    Brand: productData.brand,
    SKU: productData.mpn,
    typeOfStory: typeOfStory,
    Language: productData.lang,
    AssetUrl: `https://studio.icecat.biz/assets/${asset.id}`,
    'Screenshot Preview': `https://studio.icecat.biz/api/v2/stories/${storyId}/export?format=html&maxWidth=1200&onlyBody=false&analytics=false`,
    'Story Preview': `https://studio.icecat.biz/assets/preview?assetId=${asset.id}&storyId=${storyId}&productId=${productId}`,
    'Live Preview': `https://studio.icecat.biz/assets/preview?assetId=${asset.id}&productId=${productId}&icecatLive=true`,
    'BrandURL': `https://studio.icecat.biz/assets?id=${asset.id}`,
    Status:  'Imported'
  }
  processedProducts.push(reportData)
}

async function writeResult() {
  await fs.ensureDir(resultPath)
  const workBook = xlsx.utils.book_new()
  const workSheet = xlsx.utils.json_to_sheet(processedProducts)
  xlsx.utils.book_append_sheet(workBook, workSheet, 'download_report')
  xlsx.writeFile(workBook, `${resultPath}/download_report.xlsx`)
  console.log('report is created')
}

async function start() {
  try {
    const queue = queueModule.queueSettings()
    const petToken = await petService.loginPet()

    const directoryPath = path.join(__dirname, 'input')
    const files = await fs.readdir(directoryPath)

    for (const file of files) {
      if (path.extname(file) === '.json') {
        const data = await fs.readJson(path.join(directoryPath, file))
        queue.add(() => main(data['assetName'], data, petToken))
      }
    }
  } catch (e) {
    console.error(e)
  }
}


start()
