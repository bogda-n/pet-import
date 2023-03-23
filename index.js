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
  try {
    const petLangId = await petService.getPetLanguageId(petToken, productData.lang)
    const petBrandId = await petService.getPetBrandId(petToken, productData.brand)

    const searchedAsset = await petService.searchAsset(petBrandId, productData.mpn.toUpperCase(), productName, petLangId, petToken)
    if (searchedAsset) {
      await petService.removeStory(searchedAsset, petToken)
      await createStory(searchedAsset, productData, petToken, productName)
    } else {
      const newAsset = await petService.createAsset(productName, productData, petToken)
      await createStory(newAsset, productData, petToken, productName)
    }
  } catch (e) {
    // console.error(e.data?.errors)
    console.error(e)
    const reportData = {
      SKU: productData.mpn,
      Language: productData.lang,
      Status: 'Error',
      StatusCode: e.statusCode,
      StatusText: e.statusText,
      typeOfStory: productName.toLowerCase().trim().includes('premium') ? 'Premium' : 'Standard'
    }
    processedProducts.push(reportData)
  } finally {
    await writeResult()
  }
}

async function createStory(asset, productData, petToken, productName) {
  const typeOfStory = productName.toLowerCase().trim().includes('premium') ? 'Premium' : 'Standard'

  const storyId = await petService.createStoryV2(asset.id, petToken)
  await petService.setLayout(storyId, productData.layoutId, petToken)

  await petService.setComponentsToStory(storyId, productData.components, productData.layoutId, petToken)
  await petService.changeStatus(asset, petToken, 'Under approval') //TODO Status under approval
  const reportData = {
    SKU: productData.mpn,
    typeOfStory: typeOfStory,
    Language: productData.lang,
    AssetUrl: `https://pet.icecat.biz/assets/update/${asset.id}`,
    'Story Preview': `https://pet.icecat.biz/api/stories/preview/${storyId}`,
    // 'Icecat Preview': `https://pet.icecat.biz/product/preview?assetId=${asset.id}&langId=${asset.lang}&productId=${asset.mpns[0].id}`,
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

    const queue = queueModule.queueSettings()
    const petToken = await petService.loginPet()
    // const productsJson = readInput.readJson()
    // for (const productName in productsJson) {
    //   queue.add(() => main(productName, productsJson[productName], petToken))
    // }

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
