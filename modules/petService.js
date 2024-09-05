const axios = require('axios')
const FormData = require('form-data')

/**
 * @description - login in pet
 */
module.exports.loginPet = async function () {
  const loginPetUrl = 'https://studio.icecat.biz/api/v2/auth/login'
  const data = {
    username: process.env.PET_LOGIN,
    password: process.env.PET_PASSWORD
  }
  const getResponse = await axios.post(loginPetUrl, data)

  return getResponse.data.accessToken
}


module.exports.changeStatus = async function (asset, token, status) {
  await axios({
    method: 'PATCH',
    url: `https://studio.icecat.biz/api/v2/assets/${asset.id}/status`,
    headers: {
      Authorization: `Bearer ${token}`
    },
    data: { status: status }
  })
}

module.exports.getStories = async function (assetId, typeOfStory, token) {
  const res = await axios({
    method: 'get',
    url: 'https://studio.icecat.biz/api/v2/stories',
    params: {
      assetId: [assetId]
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  return res.data
}

/**
 * @description - check asset status and remove story v2
 * @param assetObject
 * @returns {Promise<string>}
 */

module.exports.removeStory = async function (asset, typeOfStory, token) {

  const storiesData = await this.getStories(asset.id, typeOfStory, token)

  if (typeOfStory !== 'Amazon') {
    await this.changeStatus(asset, token, 'In progress')
  }
  if (storiesData.count > 0) {
    for (const s of storiesData.items) {
      if (s.version === 2 && s.tag === typeOfStory.toLowerCase()) {
        await axios({
          method: 'DELETE',
          url: 'https://studio.icecat.biz/api/v2/stories/' + s.id,
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      }
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
    url: 'https://studio.icecat.biz/api/v2/langs',
    params: {
      sortBy: 'icecat_id',
      order: '1',
      limit: '0'
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  const languageObject = getPetLanguages.data.items.find(petLang => {
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
    url: 'https://studio.icecat.biz/api/brands/search',
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
    url: 'https://studio.icecat.biz/api/v2/assets',
    params: {
      brandIds: [brandId],
      mpns: [productData.mpn.toUpperCase()],
      langIds: [langId]
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  // Return exist asset
  if (getAssetsByBrandAndLang.data.count >= 1) {

    // Remove Multi Brands assets
    // const assetsWithoutMultipleBrands = getAssetsByBrandAndLang.data.items.filter(a => a.brands.length <= 1)

    const assets = await Promise.all(getAssetsByBrandAndLang.data.items.map(async (asset) => {
      const { data: { items } } = await axios({
        method: 'GET',
        url: 'https://studio.icecat.biz/api/v2/stories',
        params: {
          assetId: [asset.id]
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      return { ...asset, stories: items }
    }))

    //TODO AMAZON CHECK
    function assetPriority(asset) {
      const hasPremium = asset.stories.some(o => o.tag === 'premium' && o.version === 2)
      const hasStandard = asset.stories.some(o => o.tag === 'standard' && o.version === 2)

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
        method: 'DELETE',
        url: 'https://studio.icecat.biz/api/v2/assets/' + asset.id,
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
    }))
    return asset
  }

  // Create new asset if not found
  return this.createAsset(productData.title, productData, token)
}

module.exports.assetBrand = async function (brand, petToken) {
  const getPetBrands = await axios({
    method: 'get',
    url: 'https://studio.icecat.biz/api/brands/search',
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
    url: 'https://studio.icecat.biz/api/icecat/product',
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
    url: `https://studio.icecat.biz/api/icecat/product/${productId}/general`,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })

  const icecatCategory = productRequest.data.Category

  const getCategories = await axios({
    method: 'get',
    url: `https://studio.icecat.biz/api/categories/search`,
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

module.exports.getPetProduct = async function (data, petToken) {
  const getProduct = await axios({
    method: 'get',
    url: `https://studio.icecat.biz/api/v2/products/search`,
    params: data,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
  return getProduct.data[0]?.id
}


module.exports.createAsset = async function (productName, productData, petToken) {
  const assetLink = productData['link']
  const assetLangId = await this.getPetLanguageId(petToken, productData.lang)
  const brandObject = await this.assetBrand(productData.brand, petToken)

  if (brandObject) {
    const assetSkuObject = await this.assetMpn(brandObject.icecatId, productData.mpn.toUpperCase(), petToken)

    const assetCategoryObject = await this.assetCategory(assetSkuObject[0].ProductId, petToken)

    // request to find product Id(Pet product) (param icecatBrandId=3479&mpns[]=60337)
    const petProductId = await this.getPetProduct({
      icecatBrandId: brandObject.icecatId,
      mpns: [productData.mpn]
    }, petToken)


    const newAssetData = {
      'brandIds': [brandObject.id],
      'categoryId': assetCategoryObject.id,
      'langId': assetLangId,
      'link': assetLink,
      'name': `${productName} ${productData.mpn.toUpperCase()}`.trim(),
      'productIds': [petProductId],
    }

    const newAssetRequest = await axios({
      method: 'post',
      url: 'https://studio.icecat.biz/api/v2/assets',
      data: newAssetData,
      headers: {
        Authorization: `Bearer ${petToken}`
      }
    })
    return newAssetRequest.data
  }

}

module.exports.createStoryV2 = async function (assetId, typeOfStory, petToken) {
  const data = {
    'source': 'constructor',
    'version': 2,
    'tag': typeOfStory.toLowerCase(),
    'assetId': assetId
  }

  const storyCreateRequest = await axios({
    method: 'POST',
    url: 'https://studio.icecat.biz/api/v2/stories',
    data,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
  return storyCreateRequest.data.id
}

module.exports.getAssetProduct = async function (assetId, petToken) {
  const res = await axios({
    method: 'get',
    url: `https://studio.icecat.biz/api/v2/assets/${assetId}/products`,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
  return res.data[0]
}


module.exports.setLayout = async function (storyId, layoutId, petToken) {
  const setLayotRequest = await axios({
    method: 'patch',
    url: `https://studio.icecat.biz/api/v2/stories/${storyId}`,
    data: { layoutId: layoutId },
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
}

module.exports.getLayoutComponents = async function (layoutId, petToken) {
  const allComponentsRequest = await axios({
    method: 'get',
    url: `https://studio.icecat.biz/api/components?layout=${layoutId}&limit=0`,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
}

module.exports.setComponentsToStory = async function (storyId, storyComponentParents, layoutId, petToken) {
  const sortedKeys = Object.keys(storyComponentParents).sort((a, b) => {
    const componentA = Number(a.split('_')[1])
    const componentB = Number(b.split('_')[1])

    return componentA - componentB
  })
  for (const key of sortedKeys) {
    const importComponent = JSON.parse(JSON.stringify(storyComponentParents[key]))
    delete importComponent.customTemplate

    if (importComponent.petStoryComponentId) {

      // ADD story component
      const storyComponent = await axios({
        method: 'POST',
        url: `https://studio.icecat.biz/api/v2/story-components/${storyId}/add`,
        data: {
          parentId: importComponent.petStoryComponentId
        },
        headers: {
          Authorization: `Bearer ${petToken}`
        }
      })

      // logic for custom components settings
      const processData = {
        data: {
          operationType: 'processData',
          processDataContent: {
            data: importComponent.data
          }
        }
      }
      // UPDATE story component
      await axios({
        method: 'PATCH',
        url: `https://studio.icecat.biz/api/v2/story-components/${storyComponent.data.id}?res=original`,
        data: processData,
        headers: {
          Authorization: `Bearer ${petToken}`
        }
      })

      // TODO ADD Decorators changes
      // let template
      // if (storyComponentParents[key].customTemplate) {
      //   template = storyComponentParents[key].customTemplate
      // } else {
      //   template = layoutComponent.template
      // }
      // //
      // const patchData = {
      //   data: importComponent.data,
      //   template
      // }
      //
      // const addDataToComponent = await axios({
      //   method: 'patch',
      //   url: `https://studio.icecat.biz/api/stories/components/${addStoryComponent.data.id}`,
      //   data: patchData,
      //   headers: {
      //     Authorization: `Bearer ${petToken}`
      //   }
      // })
    }
  }
}
