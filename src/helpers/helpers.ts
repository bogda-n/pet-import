import { Page } from 'puppeteer'
import {
  DeleteObjectCommand,
  DeleteObjectCommandInput, GetObjectCommand, GetObjectCommandInput, HeadObjectCommand, ListObjectsV2Command,
  PutObjectCommandInput,
  S3Client,
  S3ClientConfig
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { format } from 'date-fns'

export const langs = [
  {
    code: 'it',
    name: 'Italian'
  },
  {
    code: 'fr',
    name: 'French'
  },
  {
    code: 'nl',
    name: 'Nederlands'
  },
  {
    code: 'de',
    name: 'German'
  }
]

// Function to get the current date in 'yyyy-MM-dd' format
export function getCurrentDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export async function delay(time: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, time))
}

export async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0
      const distance = 100
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight
        window.scrollBy(0, distance)
        totalHeight += distance

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
    })
  })
}

export async function waitForImagesToLoad(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const selectors = Array.from(document.querySelectorAll('img'))
    await Promise.all(selectors.map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        img.addEventListener('load', () => resolve())
        img.addEventListener('error', () => reject())
      })
    }))
  })
}

export async function ensureCSSLoaded(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const stylesheets = Array.from(document.styleSheets);
    await Promise.all(stylesheets.map(sheet => {
      if (sheet.href) {
        return new Promise<void>((resolve, reject) => {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = sheet.href ?? ''
          link.onload = () => resolve()
          link.onerror = () => reject()
          document.head.appendChild(link)
        })
      }
      return Promise.resolve()
    }))
  })
}



export interface UploadFileInput {
  buffer: Buffer
  key: string
  contentType?: string
  contentDisposition?: string
}

export interface UploadFolderInput {
  folderPath: string
  prefix: string
  parallel?: number
  contentDisposition?: string
}

export interface GetFileUrlInput {
  key: string
  expiresIn?: number
  filename?: string
}

export interface S3StorageConfig {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
  baseUrl: string
  endpoint?: string
  forcePathStyle?: boolean
}

export class S3Storage {
  private readonly client: S3Client

  constructor(private readonly config: S3StorageConfig) {
    const clientConfig: S3ClientConfig = {
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      },
      region: this.config.region
    }

    if (this.config.endpoint) {
      clientConfig.endpoint = this.config.endpoint
    }

    if (this.config.forcePathStyle) {
      clientConfig.forcePathStyle = this.config.forcePathStyle
    }

    this.client = new S3Client(clientConfig)
  }

  public get baseUrl() {
    return this.config.baseUrl
  }

  public async uploadFile(input: UploadFileInput) {

    const command: PutObjectCommandInput = {
      ACL: 'public-read',
      Bucket: this.config.bucket,
      Key: input.key,
      Body: input.buffer
    }

    if (input.contentType) {
      command.ContentType = input.contentType
    }

    if (input.contentDisposition) {
      command.ContentDisposition = input.contentDisposition
    }

    const upload = new Upload({
      client: this.client,
      params: command
    })
    await upload.done()

    return `${this.config.baseUrl}/${input.key}`
  }

  // public async uploadFolder(input: UploadFolderInput) {
  //   const limit = pLimit(input.parallel || 10)
  //   const files = await readdir(input.folderPath)
  //
  //   const uploadPromises = files.map(async file => {
  //     const fullPath = path.join(input.folderPath, file)
  //     const fileKey = path.join(input.prefix || '', file).replace(/\\/g, '/')
  //
  //     const stat = await lstat(fullPath)
  //     if (stat.isDirectory()) {
  //       return limit(() => this.uploadFolder({
  //         folderPath: fullPath,
  //         prefix: fileKey,
  //       }))
  //     } else {
  //       return limit(async () => {
  //         const buffer = await readFile(fullPath)
  //         return this.uploadFile({
  //           buffer,
  //           key: fileKey,
  //           contentType: mime.lookup(fullPath) || 'application/octet-stream',
  //           contentDisposition: input.contentDisposition || 'inline',
  //         })
  //       })
  //     }
  //   })
  //
  //   await Promise.all(uploadPromises)
  // }

  public async removeFile(key: string) {
    const input: DeleteObjectCommandInput = {
      Bucket: this.config.bucket,
      Key: key
    }
    const command = new DeleteObjectCommand(input)
    await this.client.send(command)
  }

}



