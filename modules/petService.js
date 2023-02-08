const axios = require('axios')
const FormData = require('form-data')

/**
 * @description - login in pet
 */
module.exports.loginPet = async function () {
  const loginPetUrl = 'https://pet.icecat.biz/api/auth/login'
  const data = {
    name: process.env.PET_LOGIN,
    password: process.env.PET_PASSWORD
  }
  const getResponse = await axios.post(loginPetUrl, data)
  return getResponse.data.token
}


module.exports.changeStatus = async function (asset, token, status) {
  await axios({
    method: 'post',
    url: `https://pet.icecat.biz/api/assets/${asset.id}/status`,
    headers: {
      Authorization: `Bearer ${token}`
    },
    data: {status: status}
  })
}

/**
 * @description - check asset status and remove story v2
 * @param assetObject
 * @returns {Promise<string>}
 */

module.exports.removeStory = async function (asset, token) {
  await this.changeStatus(asset, token, 'In progress')
  if (asset.objects.length) {
    const mmoObjects = await axios({
      method: 'get',
      url: `https://pet.icecat.biz/api/assets/${asset.id}/objects`,
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    if (mmoObjects.data.length) {
      for (const assetMMOObject of mmoObjects.data) {
        if (assetMMOObject.type === 'Product story v2') {
          await axios({
            method: 'delete',
            url: `https://pet.icecat.biz/api/assets/${asset.id}/objects/${assetMMOObject.id}`,
            headers: {
              Authorization: `Bearer ${token}`
            }
          })
        }
      }
    }
  }
}

/**
 * @description - get all pet languages
 * @param token
 * @param lang
 * @returns {Promise<*>}
 */
module.exports.getPetLanguageId = async function (token, lang) {
  const getPetLanguages = await axios({
    method: 'get',
    url: 'https://pet.icecat.biz/api/languages',
    params: {
      sort: 'icecat_id',
      order: 'asc',
      limit: '0'
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const languageObject = getPetLanguages.data.langs.find(petLang => {
    // if (petLang.short_code.toLowerCase() === lang.toLowerCase() || petLang.code.toLowerCase() === lang.toLowerCase()) {
    if (petLang.short_code.toLowerCase() === lang.toLowerCase()) {
      return petLang
    }
  })
  return languageObject.id
}

/**
 * @description - get pet Brand Id
 * @param token
 * @param brandName
 */
module.exports.getPetBrandId = async function (token, brandName) {
  const getPetBrands = await axios({
    method: 'get',
    url: 'https://pet.icecat.biz/api/brands/search',
    params: {
      name: brandName
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const brandObject = getPetBrands.data.find(petBrand => {
    if (petBrand.name.trim().toLowerCase() === brandName.toLowerCase()) {
      return petBrand
    }
  })

  return brandObject.id
}


/**
 * @description - search asset by brand, mpn, name, owner and language
 * @param brandId
 * @param mpn
 * @param name
 * @param langId
 * @param token
 */
module.exports.searchAsset = async function (brandId, mpn, name, langId, token) {
  const getAssetsByOwnerBrandAndLang = await axios({
    method: 'get',
    url: 'https://pet.icecat.biz/api/assets',
    params: {
      brand: brandId,
      mpn,
      lang: langId,
      owner: process.env.OWNER_ID,
      page: '1',
      limit: '25',
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  if (getAssetsByOwnerBrandAndLang.data) {
    //Todo Filter asset by Name ? approve premium if have standard???
    const assetObject = getAssetsByOwnerBrandAndLang.data.assets.find(asset => {
      if (asset.name.toLowerCase().includes('premium') && name.toLowerCase().includes('premium')) {
        return asset
      }
      if (asset.name.toLowerCase().includes('standard') && name.toLowerCase().includes('standard')) {
        return asset
      }
    })
    return assetObject
  }
}

module.exports.assetBrand = async function (brand, petToken) {
  const getPetBrands = await axios({
    method: 'get',
    url: 'https://pet.icecat.biz/api/brands/search',
    params: {
      name: brand
    },
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
  const brandObject = getPetBrands.data.find(brandItem => {
    if (brandItem.name.trim().toLowerCase() === brand.toLowerCase()) {
      return brand
    }
  })
  return brandObject
}

module.exports.assetMpn = async function (brandId, mpn, petToken) {
  const assetMpnRequest = await axios({
    method: 'post',
    url: 'https://pet.icecat.biz/api/icecat/product',
    data: {
      mpns: [mpn],
      brand: brandId
    },
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
  const mpnObject = assetMpnRequest
  return mpnObject.data
}

module.exports.assetCategory = async function (productId, petToken) {
  const productRequest = await axios({
    method: 'get',
    url: `https://pet.icecat.biz/api/icecat/product/${productId}/general`,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })

  const icecatCategory = productRequest.data.Category

  const getCategories = await axios({
    method: 'get',
    url: `https://pet.icecat.biz/api/categories/search`,
    params: {
      name: icecatCategory.CategoryName
    },
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })

  const petCategory = getCategories.data.find(category => {
    if (category.icecatId === +icecatCategory.CategoryId) {
      return category
    }
  })

  return petCategory
}

module.exports.createAsset = async function (productName, productData, petToken) {
  const assetLink = productData['link']
  const assetLangId = await this.getPetLanguageId(petToken, productData.lang)
  const brandObject = await this.assetBrand(productData.brand, petToken)

  if (brandObject) {
    const assetSkuObject = await this.assetMpn(brandObject.icecatId, productData.mpn.toUpperCase(), petToken)
    const assetCategoryObject = await this.assetCategory(assetSkuObject[0].ProductId, petToken)
    const newAssetData = {
      'brand': brandObject.id,
      'category': assetCategoryObject.id,
      'lang': assetLangId,
      'link': assetLink,
      'name': productName,
      'mpns': [
        {
          'product': productData.mpn,
          'id': assetSkuObject[0].ProductId.toString()
        }
      ]
    }
    const newAssetRequest = await axios({
      method: 'post',
      url: 'https://pet.icecat.biz/api/assets',
      data: newAssetData,
      headers: {
        Authorization: `Bearer ${petToken}`
      }
    })
    return newAssetRequest.data
  }

}

module.exports.createStoryV2 = async function (assetId, petToken) {
  const data = new FormData()
  data.append('type', 'Product story v2')
  data.append('source', 'constructor')
  const storyCreateRequest = await axios({
    method: 'post',
    url: `https://pet.icecat.biz/api/assets/${assetId}/objects`,
    data,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
  return storyCreateRequest.data.story.id
}



module.exports.setLayout = async function (storyId, layoutId, petToken) {
  const setLayotRequest = await axios({
    method: 'patch',
    url: `https://pet.icecat.biz/api/stories/${storyId}`,
    data: {layout: layoutId},
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
}

module.exports.getLayoutComponents = async function (layoutId, petToken) {
  const allComponentsRequest = await axios({
    method: 'get',
    url: `https://pet.icecat.biz/api/components?layout=${layoutId}`,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
}

module.exports.setComponentsToStory = async function (storyId, storyComponentParents, layoutId, petToken) {
  const sortedKeys = Object.keys(storyComponentParents).sort()
  for (const key of sortedKeys) {
    const importComponent = storyComponentParents[key]
    if (importComponent.petStoryComponentId) {
      const allComponentsRequest = await axios({
        method: 'get',
        url: `https://pet.icecat.biz/api/components?layout=${layoutId}`,
        headers: {
          Authorization: `Bearer ${petToken}`
        }
      })
      const layoutComponent = allComponentsRequest.data.components.find(comp => {
        if (comp.id === importComponent.petStoryComponentId) {
          return comp
        }
      })
      const componentData = {
        // data: importComponent.data,
        data: layoutComponent.data,
        name: layoutComponent.name,
        parent: layoutComponent.id,
        template: layoutComponent.template
      }
      const addStoryComponent = await axios({
        method: 'post',
        url: `https://pet.icecat.biz/api/stories/${storyId}/components`,
        data: componentData,
        headers: {
          Authorization: `Bearer ${petToken}`
        }
      })

      // console.log('importComponent.data', importComponent.data)

      const patchData = {
        data: importComponent.data,
        template: layoutComponent.template
      }

      const addDataToComponent = await axios({
        method: 'patch',
        url: `https://pet.icecat.biz/api/stories/components/${addStoryComponent.data.id}`,
        data: patchData,
        headers: {
          Authorization: `Bearer ${petToken}`
        }
      })
    }
  }
}
