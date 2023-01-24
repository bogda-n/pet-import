const axios = require('axios')
const FormData = require('form-data')

/**
 * @description - login in pet
 * @returns {Promise<CancelToken>}
 */
module.exports.loginPet = async function () {
  const loginPetUrl = 'https://pet.icecat.biz/api/auth/login'
  const data = {
    name: pet-login,
    password: pet-password
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
    data: { status: status }
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
      order: 'asc'
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const languageObject = getPetLanguages.data.langs.find(petLang => {
    if (petLang.short_code.toLowerCase() === lang.toLowerCase() || petLang.code.toLowerCase() === lang.toLowerCase()) {
      return petLang
    }
  })
  return languageObject.id
}


/**
 * @description - search asset by name brand and language
 * @param brand
 * @param name
 * @param langId
 * @param token
 * @returns {Promise<void>}
 */
module.exports.searchAsset = async function (brand, name, langId, token) {
  const assetsByNameAndBrand = await axios({
    method: 'get',
    url: 'https://pet.icecat.biz/api/assets',
    params: {
      name,
      brand,
      lang: langId,
      page: '1',
      limit: '25'
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  if (assetsByNameAndBrand.data) {
    const assetObject = assetsByNameAndBrand.data.assets.find(asset => {
      return asset
    })
    return assetObject
  }
}

module.exports.assetBrand = async function (brand, petToken) {
  const assetBrandRequest = await axios({
    method: 'post',
    url: 'https://pet.icecat.biz/api/icecat/brand',
    data: {
      query: brand
    },
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
  const brandObject = assetBrandRequest.data.find(brandItem => {
    if (brandItem.Name.replace('+', ' ').trim().toLowerCase() === brand.toLowerCase()) {
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
  return productRequest.data.Category
}

module.exports.createAsset = async function (productName, productData, petToken) {
  const assetLink = productData['link']
  const assetLangId = await this.getPetLanguageId(petToken, productData.lang)
  const brandObject = await this.assetBrand(productData.brand, petToken)
  if (brandObject) {
    const assetSkuObject = await this.assetMpn(brandObject.BrandId, productData.mpn, petToken)
    const assetCategoryObject = await this.assetCategory(assetSkuObject[0].ProductId, petToken)
    const newAssetData = {
      'brand': {
        'name': brandObject.Name,
        'id': brandObject.BrandId
      },
      'category': {
        'name': assetCategoryObject.CategoryName,
        'id': assetCategoryObject.CategoryId
      },
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

module.exports.createStory = async function (assetId, petToken) {
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
    data: { layout: layoutId },
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
        data: importComponent.data,
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

    }
  }


}