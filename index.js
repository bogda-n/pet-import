const petService = require('./modules/petService')
const readInput = require('./modules/readInput')
const queueModule = require('./modules/queue')
const xlsx = require('xlsx')
const fs = require('fs-extra')
const path = require('path')

const processedProducts = []
const resultPath = path.resolve(__dirname, 'result')

async function main(productName, productData, petToken) {
  try {
    const petLangId = await petService.getPetLanguageId(petToken, productData.lang)
    const searchedAsset = await petService.searchAsset(productData.brand, productName, petLangId, petToken)
    if (searchedAsset) {
      await petService.removeStory(searchedAsset, petToken)
      await createStory(searchedAsset, productData, petToken)
    } else {
      const newAsset = await petService.createAsset(productName, productData, petToken)
      await createStory(newAsset, productData, petToken)
    }
  } catch (e) {
    console.error(e)
    const reportData = {
      SKU: productData.mpn,
      Language: productData.lang,
      StatusCode: e.statusCode,
      StatusText: e.statusText
    }
    processedProducts.push(reportData)
  } finally {
    await writeResult()
  }
}

async function createStory(asset, productData, petToken) {
  const storyId = await petService.createStory(asset.id, petToken)
  await petService.setLayout(storyId, productData.layoutId, petToken)
  await petService.setComponentsToStory(storyId, productData.components, productData.layoutId, petToken)
  await petService.changeStatus(asset, petToken, 'Approved')
  const reportData = {
    SKU: productData.mpn,
    Language: productData.lang,
    AssetUrl: `https://pet.icecat.biz/assets/update/${asset.id}`,
    Preview: `https://pet.icecat.biz/product/preview?assetId=${asset.id}&langId=${asset.lang}&productId=${asset.mpns[0].id}`,
    Status: 'Imported'
  }
  processedProducts.push(reportData)
}

async function writeResult() {
  await fs.ensureDir(resultPath)
  const workBook = xlsx.utils.book_new()
  const workSheet = xlsx.utils.json_to_sheet(processedProducts)
  xlsx.utils.book_append_sheet(workBook, workSheet, 'result')
  xlsx.writeFile(workBook, `${resultPath}/result.xlsx`)
  console.log('report is created')
}

async function start() {
  try {
    const productsJson = readInput.readJson()
    const queue = queueModule.queueSettings()
    const petToken = await petService.loginPet()
    for (const productName in productsJson) {
      queue.add(() => main(productName, productsJson[productName], petToken))
    }
  } catch (e) {
    console.error(e)
  }
}


start()