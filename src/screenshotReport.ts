import { config as dotenvConfig } from 'dotenv'

dotenvConfig()

import path from 'path'
import fs from 'fs-extra'
import xlsx from 'xlsx'
import puppeteer from 'puppeteer'
import {
  autoScroll,
  delay,
  ensureCSSLoaded,
  S3Storage,
  waitForImagesToLoad,
  getCurrentDate,
  langs
} from './helpers/helpers'
import { createObjectCsvWriter } from 'csv-writer'
import pLimit from 'p-limit'

const limit = pLimit(4)

enum StoryType {
  Standard = 'Standard',
  Premium = 'Premium'
}

// Row of the new import report CSV (semicolon-separated)
interface ReportRow {
  'Asset ID': string
  'Asset Link': string
  'Story ID': string
  'Story Link': string
  'Asset Name': string
  Brand: string
  MPN: string
  Lang: string
  'Import Status': string
  Variant: string
  GTIN: string
  ASIN: string
  Error: string
  Warnings: string
  'Job ID': string
}

interface ProductData {
  Brand: string
  SKU: string
  typeOfStory: StoryType
  Language: string
  AssetUrl: string
  'Screenshot Preview': string
  'Story Preview': string
  Status: string
}

export interface ResultData {
  SKU: string | number
  Brand: string
  Language: string

  [key: string]: string | number
}

const DEFAULT_ORIGIN = 'https://studio.icecat.biz'

const config = {
  accessKeyId: process.env.S3_STORAGE_ACCESS_KEY_ID!,
  secretAccessKey: process.env.S3_STORAGE_SECRET_ACCESS_KEY!,
  region: process.env.S3_STORAGE_BUCKET_REGION!,
  bucket: process.env.S3_STORAGE_BUCKET_NAME!,
  baseUrl: process.env.S3_STORAGE_BASE_URL!,
  endpoint: process.env.S3_STORAGE_ENDPOINT!,
  forcePathStyle: !!process.env.S3_STORAGE_ENDPOINT!
}

const s3Storage = new S3Storage(config)

// Build the old-style export link used for screenshots from the Story ID
function buildScreenshotUrl(row: ReportRow): string {
  let origin = DEFAULT_ORIGIN
  try {
    origin = new URL(row['Story Link']).origin
  } catch {
    // keep default origin
  }
  return `${origin}/api/v2/stories/${row['Story ID']}/export?format=html&maxWidth=1200&onlyBody=false&analytics=false`
}

function mapReportRow(row: ReportRow): ProductData {
  const variant = String(row.Variant || '').trim().toLowerCase()

  return {
    Brand: String(row.Brand || ''),
    SKU: String(row.MPN || ''),
    typeOfStory: variant === 'premium' ? StoryType.Premium : StoryType.Standard,
    Language: String(row.Lang || ''),
    AssetUrl: String(row['Asset Link'] || ''),
    'Screenshot Preview': buildScreenshotUrl(row),
    'Story Preview': String(row['Story Link'] || ''),
    Status: String(row['Import Status'] || '')
  }
}

async function takeScreenshot(url: string, productData: ProductData): Promise<Record<string, string>> {
  const currentDate = getCurrentDate()
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--disable-setuid-sandbox'],
    protocolTimeout: 120000
  })
  const page = await browser.newPage()

  try {
    await page.setViewport({ width: 1230, height: 800 })
    await page.goto(url, { waitUntil: 'networkidle0' })

    await autoScroll(page)
    await waitForImagesToLoad(page)
    await ensureCSSLoaded(page)
    await delay(2000)

    await page.waitForNetworkIdle({ idleTime: 2000 })

    // Adjust the container and wrapper width
    await page.evaluate(() => {
      document.querySelectorAll('.pet-hide-\\$md').forEach(el => el.remove())

      const container = document.querySelector('.pet-container')
      const wrapper = document.querySelector('.pet-wrapper')
      if (container) {
        container.setAttribute('style', 'max-width: 1230px !important;')
      }
      if (wrapper) {
        wrapper.setAttribute('style', 'max-width: 1230px !important;')
      }
    })

    await delay(3000)

    const bodyHandle = await page.$('body')
    if (bodyHandle) {
      const boundingBox = await bodyHandle.boundingBox()
      if (boundingBox) {
        await page.setViewport({ width: 1230, height: Math.ceil(boundingBox.height) })
      }
      await bodyHandle.dispose()
    } else {
      throw new Error('Body element not found on the page.')
    }

    const rows = await page.$$('.pet-row')

    if (!rows || rows.length === 0) {
      throw new Error('No .pet-row elements found on the page.')
    }

    const fileUrls: Record<string, string> = {}

    let index = 1
    for (const element of rows) {

      const shouldSkip = await page.evaluate(el => {
        return el.classList.contains('pet-ar-3d-row') || el.querySelector('.pet-video')
      }, element)

      if (shouldSkip) {
        console.log(`Component ${index} contains a video or AR content, skipping.`)
      } else {

        if (productData.typeOfStory === StoryType.Standard) {
          await page.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'end' }), element)
        } else {
          await page.evaluate(el => el.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
          }), element)
        }

        await delay(2000)

        await page.evaluate(el => {

          const hotspots = el.querySelector('.pet-hotspots')
          hotspots && hotspots.remove()

          const sliderButtonNext = el.querySelector('.pet-slider-button-next')
          sliderButtonNext && sliderButtonNext.remove()

          const sliderButtonPrev = el.querySelector('.pet-slider-button-prev')
          sliderButtonPrev && sliderButtonPrev.remove()

        }, element)

        const boundingBox = await element.boundingBox()
        if (boundingBox) {
          await delay(2000)

          const computedStyle = await page.evaluate(el => {
            const style = window.getComputedStyle(el)
            return {
              marginBottom: parseFloat(style.marginBottom) || 0
            }
          }, element)

          await delay(2000)

          let clip

          if (productData.typeOfStory === StoryType.Standard) {
            clip = {
              x: boundingBox?.x + 15,  // remove paddings left/right 15px
              y: index !== 1 ? boundingBox.y + computedStyle.marginBottom - 1 : boundingBox.y,
              width: boundingBox.width - 30, // remove paddings left/right 15px
              height: Math.floor(boundingBox.height + computedStyle.marginBottom) - 2
            }
          } else {
            clip = {
              x: boundingBox?.x + 15,  // remove paddings left/right 15px
              y: boundingBox.y + computedStyle.marginBottom + 2,
              width: boundingBox.width - 30, // remove paddings left/right 15px
              height: boundingBox.height + computedStyle.marginBottom - 2
            }

          }

          const buffer = await page.screenshot({ type: 'jpeg', quality: 100, clip })

          const s3Key = `${currentDate}/${productData.SKU}_${productData.Language}_${productData.typeOfStory}/${index}`

          // Upload to S3 and get the URL
          const fileUrl = await s3Storage.uploadFile({
            buffer,
            key: s3Key,
            contentType: 'image/jpeg'
          })
          console.log('fileUrl', fileUrl)

          fileUrls[`img-${String(index).padStart(2, '0')}`] = fileUrl

          index++
        } else {
          console.log(`Element ${index} is not visible, skipping.`)
        }
      }
    }

    return fileUrls
  } catch (e) {
    throw e
  } finally {
    await browser.close()
  }
}

async function main(productData: ProductData): Promise<ResultData> {
  try {
    const fileUrls = await takeScreenshot(productData['Screenshot Preview'], productData)

    return {
      SKU: productData.SKU,
      Brand: productData.Brand,
      Language: productData.Language,
      ...fileUrls
    }
  } catch (e) {

    console.error(`Error processing product ${productData.SKU}`, e)
    return {
      SKU: productData.SKU,
      Brand: productData.Brand,
      Language: productData.Language,
      Error: e instanceof Error ? e.message : 'Unknown error occurred.',
    }
  }
}

const start = async (): Promise<void> => {
  try {
    console.log('Start', new Date())

    const inputDir = path.resolve(__dirname, '../input_screenshot_report')
    const resultPath = path.resolve(__dirname, '../result')

    const results: ResultData[] = []
    const allUrls: string[] = []

    if (!(await fs.pathExists(inputDir))) {
      console.error('Input directory not found:', inputDir)
      return
    }

    const files = (await fs.readdir(inputDir)).filter(f => !f.startsWith('.'))

    if (files.length === 0) {
      console.error('No files found in the input directory:', inputDir)
      return
    }

    // Read the first report file (csv or xlsx — xlsx lib handles both)
    const firstFile = path.join(inputDir, files[0])
    console.log('Reading report:', firstFile)

    const workbook = xlsx.readFile(firstFile)
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const reportRows: ReportRow[] = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' })

    const withStory = reportRows.filter(row => String(row['Story ID'] || '').trim())
    const skipped = reportRows.length - withStory.length
    if (skipped > 0) {
      console.log(`Skipped ${skipped} row(s) without Story ID`)
    }

    const productData = withStory.map(mapReportRow)
    console.log(`Processing ${productData.length} row(s)`)

    await Promise.all(productData.map(product => {
      return limit(async () => {
        const lang = langs.find(l => l.code.toLowerCase() === product.Language.toLowerCase())
        product.Language = lang?.name || 'not found'
        const result = await main(product)
        results.push(result)
      })
    }))

    results.forEach(r => {
      Object.values(r).forEach(value => {
        if (typeof value === 'string' && value.startsWith('http')) {
          allUrls.push(value)
        }
      })
    })

    const csvWriter = createObjectCsvWriter({
      path: path.join(resultPath, `report_${new Date().toISOString().replace(/:/g, '-')}.csv`),
      header: [
        { id: 'SKU', title: 'Product code' },
        { id: 'Brand', title: 'Brand' },
        { id: 'Language', title: 'Language' },
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `img-${String(i + 1).padStart(2, '0')}`,
          title: `img-${String(i + 1).padStart(2, '0')}`
        })),
        { id: 'Error', title: 'Error' }
      ]
    })

    await csvWriter.writeRecords(results)
    console.log('CSV report saved to', path.join(resultPath, `report_${new Date().toISOString().replace(/:/g, '-')}.csv`))

    // Write all URLs to a separate CSV file
    const allUrlsPath = path.join(resultPath, `all_urls_${new Date().toISOString().replace(/:/g, '-')}.csv`)
    await fs.writeFile(allUrlsPath, allUrls.join('\n'))
    console.log('All URLs CSV saved to', allUrlsPath)

    console.log('End', new Date())
  } catch (error) {
    console.error(error)
  }
}

start()
