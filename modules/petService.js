const axios = require('axios')
const FormData = require('form-data')

/**
 * @description - login in pet
 */
module.exports.loginPet = async function () {
  const loginPetUrl = 'https://pet.icecat.biz/api/v2/auth/login'
  const data = {
    username: process.env.PET_LOGIN,
    password: process.env.PET_PASSWORD
  }
  const getResponse = await axios.post(loginPetUrl, data)

  return getResponse.data.accessToken
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

module.exports.removeStory = async function (asset, typeOfStory, token) {
  await this.changeStatus(asset, token, 'Under approval')

  for (const object of asset.objects) {
    if ((object.type === 'Product story v2' && object.story.tag === typeOfStory) || object.type === 'Product story') {
      await axios({
        method: 'delete',
        url: `https://pet.icecat.biz/api/assets/${asset.id}/objects/${object.id}`,
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
    }
  }

}

/*
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
module.exports.getOrCreateAsset = async function (brandId, productData, name, langId, token) {
  const getAssetsByBrandAndLang = await axios({
    method: 'get',
    url: 'https://pet.icecat.biz/api/assets',
    params: {
      brand: brandId,
      mpn: productData.mpn.toUpperCase(),
      lang: langId
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  // Return exist asset
  if (getAssetsByBrandAndLang.data.count >= 1) {
    const assets = await Promise.all(getAssetsByBrandAndLang.data.assets.map(async (asset) => {
        const {data} = await axios({
          method: 'get',
          url: 'https://pet.icecat.biz/api/assets/' + asset.id,
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
        return data
      })
    )

    function assetPriority(asset) {
      const hasPremium = asset.objects.some(o => o.story.tag === 'Premium' && o.type === 'Product story v2')
      const hasStandard = asset.objects.some(o => o.story.tag === 'Standard' && o.type === 'Product story v2')

      switch (true) {
        case hasPremium && hasStandard: {
          return 2
        }
        case hasPremium && !hasStandard: {
          return 1
        }
        case !hasPremium && hasStandard: {
          return 0
        }
        default:
          return -1
      }
    }


    const sortedAssets = assets.sort((a, b) => {
      return assetPriority(a) - assetPriority(b)
    })

    const asset = sortedAssets.pop()

    await Promise.all(sortedAssets.map(asset => {
      return axios({
        method: 'delete',
        url: 'https://pet.icecat.biz/api/assets/' + asset.id,
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
    }))
    return asset
  }

  // Create new asset if not found
  // return this.createAsset(name, productData, token)

  return this.createAsset(productData.title, productData, token)
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
      'name': `${productName} ${productData.mpn.toUpperCase()}`.trim(),
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

module.exports.createStoryV2 = async function (assetId, typeOfStory, petToken) {
  const data = new FormData()
  data.append('type', 'Product story v2')
  data.append('source', 'constructor')
  data.append('tag', typeOfStory)

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
  const sortedKeys = Object.keys(storyComponentParents).sort((a, b) => {
    const componentA = Number(a.split("_")[1])
    const componentB = Number(b.split("_")[1])

    return componentA - componentB
  })
  for (const key of sortedKeys) {
    const importComponent = JSON.parse(JSON.stringify(storyComponentParents[key]))
    delete importComponent.customTemplate

    if (importComponent.petStoryComponentId) {
      const allComponentsRequest = await axios({
        method: 'get',
          url: `https://pet.icecat.biz/api/components?layout=${layoutId}&limit=0`,
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
      // logic for custom components settings
      let template
      if(storyComponentParents[key].customTemplate) {
        template = storyComponentParents[key].customTemplate
      } else {
        template = layoutComponent.template
      }
      //
      const patchData = {
        data: importComponent.data,
        template
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
