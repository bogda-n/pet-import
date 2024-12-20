const axios = require('axios')
const FormData = require('form-data')
const generalLink = 'https://studio.icecat.biz/api/v2'
/**
 * @description - login in pet
 */
module.exports.loginPet = async function () {
  const loginPetUrl = `${generalLink}/auth/login`
  const data = {
    username: process.env.PET_LOGIN,
    password: process.env.PET_PASSWORD
  }
  const getResponse = await axios.post(loginPetUrl, data)

  return getResponse.data.accessToken
}


module.exports.changeStatus = async function (storyId, token, status) {

  switch (status) {
    case 'completed': {
      await axios({
        method: 'PATCH',
        url: `${generalLink}/stories/${storyId}/status`,
        headers: {
          Authorization: `Bearer ${token}`
        },
        data: { status: 'mapped' }
      })

      await axios({
        method: 'PATCH',
        url: `${generalLink}/stories/${storyId}/status`,
        headers: {
          Authorization: `Bearer ${token}`
        },
        data: { status: 'completed' }
      })
      break
    }
    default:
      await axios({
        method: 'PATCH',
        url: `${generalLink}/stories/${storyId}/status`,
        headers: {
          Authorization: `Bearer ${token}`
        },
        data: { status: 'completed' }
      })
  }
}

module.exports.getStories = async function (assetId, typeOfStory, token) {
  const res = await axios({
    method: 'get',
    url: `${generalLink}/stories`,
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

  if (storiesData.count > 0) {
    for (const s of storiesData.items) {
      // TODO Exclusive remove ???
      if (s.version === 2 && s.tag === typeOfStory.toLowerCase() && s.tag !== 'exclusive' && s.tag !== 'amazon' && s.tag !== 'amazon-premium') {

        // await this.changeStatus(s.id, token, 'in-progress') // TODO Error   message: 'The story is already in the "in-progress" status.',   statusCode: 400

        await axios({
          method: 'DELETE',
          url: `${generalLink}/stories/${s.id}`,
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
    url: `${generalLink}/langs`,
    params: {
      sortBy: 'icecat_id',
      order: '1'
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const languageObject = getPetLanguages.data.items.find(petLang => {

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
    url: `${generalLink}/brands/search`,
    params: {
      name: brandName
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const brandObject = getPetBrands.data.items.find(petBrand => {
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
    url: `${generalLink}/assets`,
    params: {
      brandIds: [brandId],
      searchKeys: [productData.mpn.toUpperCase()],
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
        url: `${generalLink}/stories`,
        params: {
          assetId: [asset.id]
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      return { ...asset, stories: items }
    }))

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
    // TODO Remove if  several bRANDS???
    // await Promise.all(sortedAssets.map(asset => {
    //   return axios({
    //     method: 'DELETE',
    //     url: 'https://studio.icecat.biz/api/v2/assets/' + asset.id,
    //     headers: {
    //       Authorization: `Bearer ${token}`
    //     }
    //   })
    // }))
    return asset
  }

  // Create new asset if not found
  return this.createAsset(productData.title, productData, token)
}

module.exports.assetBrand = async function (name, petToken) {
  const getPetBrands = await axios({
    method: 'get',
    url: `${generalLink}/brands/search`,
    params: {
      name
    },
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })

  const brandObject = getPetBrands.data.items.find(petBrand => {
    if (petBrand.name.trim().toLowerCase() === name.toLowerCase()) {
      return petBrand
    }
  })

  return brandObject
}

module.exports.getProduct = async function (brandObject, mpn, petToken) {
  const productsRequest = await axios({
    method: 'GET',
    url: `${generalLink}/products/search`,
    params: {
      brandId: brandObject.id,
      mpns: [mpn]
    },
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })

  const mpnId = productsRequest.data.items[0].id

  const products = await axios({
    method: 'GET',
    url: `${generalLink}/products/${mpnId}`,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
  return products.data
}

module.exports.createAsset = async function (productName, productData, petToken) {

  const assetLink = productData['link']

  const assetLangId = await this.getPetLanguageId(petToken, productData.lang)

  const brandObject = await this.assetBrand(productData.brand, petToken)

  if (!brandObject) {
    throw new Error('Brand not found')
  }

  const product = await this.getProduct(brandObject, productData.mpn.toUpperCase(), petToken)

  if (!product) {
    throw new Error('MPN not found')
  }

  const dataToCreate = {
    langId: assetLangId,
    brandIds: [
      product.brand.id
    ],
    categoryId: product.category.id,
    name: productName,
    productIds: [
      product.id
    ],
    asinIds: [],
    link: assetLink
  }

  const newAssetRequest = await axios({
    method: 'POST',
    url: 'https://studio.icecat.biz/api/v2/assets',
    data: dataToCreate,
    headers: {
      Authorization: `Bearer ${petToken}`
    }
  })
  return newAssetRequest.data
}

module.exports.createStoryV2 = async function (assetId, typeOfStory, layoutId, petToken) {
  const data = {
    assetId,
    layoutId,
    source: 'constructor',
    tag: typeOfStory.toLowerCase(),
    version: 2
    //companyId
  }

  const storyCreateRequest = await axios({
     method: 'POST',
     url: `${generalLink}/stories`,
     data,
     headers: { Authorization: `Bearer ${petToken} `
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
        url: `${generalLink}/story-components`,
        data: {
          storyId,
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
        url: `${generalLink}/story-components/${storyComponent.data.id}?res=original`,
        data: processData,
        headers: {
          Authorization: `Bearer ${petToken}`
        }
      })
      // add decorators
      if (storyComponentParents[key].decorators) {
        await axios({
          method: 'PATCH',
          url: `${generalLink}/story-components/${storyComponent.data.id}/update-decorators?res=original`,
          data: {
            decorators: storyComponentParents[key].decorators
          },
          headers: {
            Authorization: `Bearer ${petToken}`
          }
        })
      }
    }
  }
}
