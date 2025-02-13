import { ipcMain, IpcMainEvent } from 'electron'
import fs from 'fs-extra'
import http from 'http'
import https from 'https'
import path from 'path'
import { createClient, WebDAVClient, FileStat, ProgressEvent, AuthType, WebDAVClientOptions } from 'webdav'

import windowManager from 'apis/app/window/windowManager'

import UpDownTaskQueue from '~/manage/datastore/upDownTaskQueue'
import { formatError, getInnerAgent, NewDownloader, ConcurrencyPromisePool } from '~/manage/utils/common'
import ManageLogger from '~/manage/utils/logger'

import { getAuthHeader } from '@/manage/utils/digestAuth'

import { commonTaskStatus, IWindowList, uploadTaskSpecialStatus } from '#/types/enum'
import { isImage, formatEndpoint, formatHttpProxy } from '#/utils/common'
import { cancelDownloadLoadingFileList, refreshDownloadFileTransferList } from '#/utils/static'

class WebdavplistApi {
  endpoint: string
  username: string
  password: string
  sslEnabled: boolean
  proxy: string | undefined
  proxyStr: string | undefined
  authType: 'basic' | 'digest' | undefined
  logger: ManageLogger
  agent: https.Agent | http.Agent
  ctx: WebDAVClient

  constructor(
    endpoint: string,
    username: string,
    password: string,
    sslEnabled: boolean,
    proxy: string | undefined,
    authType: 'basic' | 'digest' | undefined,
    logger: ManageLogger
  ) {
    this.endpoint = formatEndpoint(endpoint, sslEnabled)
    this.username = username
    this.password = password
    this.sslEnabled = sslEnabled
    this.proxy = proxy
    this.proxyStr = formatHttpProxy(proxy, 'string') as string | undefined
    this.authType = authType || 'basic'
    this.logger = logger
    this.agent = getInnerAgent(proxy, sslEnabled).agent
    const options: WebDAVClientOptions = {
      username: this.username,
      password: this.password,
      maxBodyLength: 4 * 1024 * 1024 * 1024,
      maxContentLength: 4 * 1024 * 1024 * 1024,
      httpsAgent: sslEnabled ? this.agent : undefined,
      httpAgent: !sslEnabled ? this.agent : undefined
    }
    if (this.authType === 'digest') {
      options.authType = AuthType.Digest
    }
    this.ctx = createClient(this.endpoint, options)
  }

  logParam = (error: any, method: string) => this.logger.error(formatError(error, { class: 'WebdavplistApi', method }))

  formatFolder(item: FileStat, urlPrefix: string, isWebPath = false) {
    const key = item.filename.replace(/^\/+/, '')
    return {
      ...item,
      key,
      fileName: item.basename,
      fileSize: 0,
      Key: key,
      formatedTime: '',
      isDir: true,
      checked: false,
      isImage: false,
      match: false,
      url: isWebPath ? urlPrefix : `${urlPrefix}${item.filename}`
    }
  }

  formatFile(item: FileStat, urlPrefix: string, isWebPath = false) {
    const key = item.filename.replace(/^\/+/, '')
    return {
      ...item,
      key,
      fileName: item.basename,
      fileSize: item.size,
      Key: key,
      formatedTime: new Date(item.lastmod).toLocaleString(),
      isDir: false,
      checked: false,
      match: false,
      isImage: isImage(item.basename),
      url: isWebPath ? urlPrefix : `${urlPrefix}${item.filename}`
    }
  }

  isRequestSuccess = (code: number) => code >= 200 && code < 300

  async getBucketListRecursively(configMap: IStringKeyMap): Promise<any> {
    const window = windowManager.get(IWindowList.SETTING_WINDOW)!
    const { prefix, customUrl, cancelToken } = configMap
    const urlPrefix = customUrl || this.endpoint
    const cancelTask = [false]
    ipcMain.on(cancelDownloadLoadingFileList, (_: IpcMainEvent, token: string) => {
      if (token === cancelToken) {
        cancelTask[0] = true
        ipcMain.removeAllListeners(cancelDownloadLoadingFileList)
      }
    })
    let res = {} as any
    const result = {
      fullList: <any>[],
      success: false,
      finished: false
    }
    try {
      res = await this.ctx.getDirectoryContents(prefix, {
        deep: true,
        details: true
      })
      if (this.isRequestSuccess(res.status)) {
        if (res.data?.length) {
          res.data.forEach((item: FileStat) => {
            if (item.type !== 'directory') {
              result.fullList.push(this.formatFile(item, urlPrefix))
            }
          })
        }
        result.success = true
      }
    } catch (error) {
      this.logParam(error, 'getBucketListRecursively')
    }
    result.finished = true
    window.webContents.send(refreshDownloadFileTransferList, result)
    ipcMain.removeAllListeners(cancelDownloadLoadingFileList)
  }

  async getBucketListBackstage(configMap: IStringKeyMap): Promise<any> {
    const window = windowManager.get(IWindowList.SETTING_WINDOW)!
    const { prefix, customUrl, cancelToken, baseDir } = configMap
    let urlPrefix = customUrl || this.endpoint
    urlPrefix = urlPrefix.replace(/\/+$/, '')
    let webPath = configMap.webPath || ''
    if (webPath && customUrl && webPath !== '/') {
      webPath = webPath.replace(/^\/+|\/+$/, '')
    }
    const cancelTask = [false]
    ipcMain.on('cancelLoadingFileList', (_: IpcMainEvent, token: string) => {
      if (token === cancelToken) {
        cancelTask[0] = true
        ipcMain.removeAllListeners('cancelLoadingFileList')
      }
    })
    let res = {} as any
    const result = {
      fullList: <any>[],
      success: false,
      finished: false
    }
    try {
      res = await this.ctx.getDirectoryContents(prefix, {
        deep: false,
        details: true
      })
      if (this.isRequestSuccess(res.status)) {
        if (res.data?.length) {
          res.data.forEach((item: FileStat) => {
            const relativePath = path.relative(baseDir, item.filename)
            const relative =
              webPath && urlPrefix + `/${path.join(webPath, relativePath)}`.replace(/\\/g, '/').replace(/\/+/g, '/')
            if (item.type === 'directory') {
              result.fullList.push(this.formatFolder(item, webPath ? relative : urlPrefix, !!webPath))
            } else {
              result.fullList.push(this.formatFile(item, webPath ? relative : urlPrefix, !!webPath))
            }
          })
        }
      } else {
        result.finished = true
        window.webContents.send('refreshFileTransferList', result)
        ipcMain.removeAllListeners('cancelLoadingFileList')
        return
      }
    } catch (error) {
      this.logParam(error, 'getBucketListBackstage')
      result.finished = true
      window.webContents.send('refreshFileTransferList', result)
      ipcMain.removeAllListeners('cancelLoadingFileList')
      return
    }
    result.success = true
    result.finished = true
    window.webContents.send('refreshFileTransferList', result)
    ipcMain.removeAllListeners('cancelLoadingFileList')
  }

  async renameBucketFile(configMap: IStringKeyMap): Promise<boolean> {
    const { oldKey, newKey } = configMap
    let result = false
    try {
      await this.ctx.moveFile(oldKey, newKey)
      result = true
    } catch (error) {
      this.logParam(error, 'renameBucketFile')
    }
    return result
  }

  async deleteBucketFile(configMap: IStringKeyMap): Promise<boolean> {
    const { key } = configMap
    let result = false
    try {
      await this.ctx.deleteFile(key)
      result = true
    } catch (error) {
      this.logParam(error, 'deleteBucketFile')
    }
    return result
  }

  async deleteBucketFolder(configMap: IStringKeyMap): Promise<boolean> {
    const { key } = configMap
    let result = false
    try {
      await this.ctx.deleteFile(key)
      result = true
    } catch (error) {
      this.logParam(error, 'deleteBucketFolder')
    }
    return result
  }

  async getPreSignedUrl(configMap: IStringKeyMap): Promise<string> {
    const { key } = configMap
    let result = ''
    try {
      const res = this.ctx.getFileDownloadLink(key)
      result = res
    } catch (error) {
      this.logParam(error, 'getPreSignedUrl')
    }
    return result
  }

  async uploadBucketFile(configMap: IStringKeyMap): Promise<boolean> {
    const { fileArray } = configMap
    const instance = UpDownTaskQueue.getInstance()
    for (const item of fileArray) {
      const { alias, bucketName, region, key, filePath, fileName } = item
      const id = `${alias}-${bucketName}-${key}-${filePath}`
      if (instance.getUploadTask(id)) {
        continue
      }
      instance.addUploadTask({
        id,
        progress: 0,
        status: commonTaskStatus.queuing,
        sourceFileName: fileName,
        sourceFilePath: filePath,
        targetFilePath: key,
        targetFileBucket: bucketName,
        targetFileRegion: region,
        noProgress: true
      })
      this.ctx
        .putFileContents(key, this.authType === 'digest' ? fs.readFileSync(filePath) : fs.createReadStream(filePath), {
          overwrite: true,
          onUploadProgress: (progressEvent: ProgressEvent) => {
            instance.updateUploadTask({
              id,
              progress: Math.floor((progressEvent.loaded / progressEvent.total) * 100),
              status: uploadTaskSpecialStatus.uploading
            })
          }
        })
        .then((res: boolean) => {
          if (res) {
            instance.updateUploadTask({
              id,
              progress: 100,
              status: uploadTaskSpecialStatus.uploaded,
              finishTime: new Date().toLocaleString()
            })
          } else {
            instance.updateUploadTask({
              id,
              progress: 0,
              status: commonTaskStatus.failed,
              finishTime: new Date().toLocaleString()
            })
          }
        })
        .catch((error: any) => {
          this.logParam(error, 'uploadBucketFile')
          instance.updateUploadTask({
            id,
            progress: 0,
            status: commonTaskStatus.failed,
            finishTime: new Date().toLocaleString()
          })
        })
    }
    return true
  }

  async createBucketFolder(configMap: IStringKeyMap): Promise<boolean> {
    const { key } = configMap
    let result = false
    try {
      await this.ctx.createDirectory(key, {
        recursive: true
      })
      result = true
    } catch (error) {
      this.logParam(error, 'createBucketFolder')
    }
    return result
  }

  async downloadBucketFile(configMap: IStringKeyMap): Promise<boolean> {
    const { downloadPath, fileArray, maxDownloadFileCount } = configMap
    const instance = UpDownTaskQueue.getInstance()
    const promises = [] as any
    for (const item of fileArray) {
      const { alias, bucketName, region, key, fileName } = item
      const savedFilePath = path.join(downloadPath, fileName)
      const id = `${alias}-${bucketName}-${region}-${key}`
      if (instance.getDownloadTask(id)) {
        continue
      }
      instance.addDownloadTask({
        id,
        progress: 0,
        status: commonTaskStatus.queuing,
        sourceFileName: fileName,
        targetFilePath: savedFilePath
      })
      let preSignedUrl = await this.getPreSignedUrl({
        key
      })
      let headers = {} as IStringKeyMap
      if (this.authType === 'basic' || !this.authType) {
        const base64Str = Buffer.from(`${this.username}:${this.password}`).toString('base64')
        headers = {
          Authorization: `Basic ${base64Str}`
        }
      } else if (this.authType === 'digest') {
        const authHeader = await getAuthHeader(
          'GET',
          this.endpoint,
          `/${key.replace(/^\/+/, '')}`,
          this.username,
          this.password
        )
        headers = {
          Authorization: authHeader
        }
        preSignedUrl = `${this.endpoint}/${key.replace(/^\/+/, '')}`
      }
      promises.push(
        () =>
          new Promise((resolve, reject) => {
            NewDownloader(instance, preSignedUrl, id, savedFilePath, this.logger, this.proxyStr, headers).then(
              (res: boolean) => {
                if (res) {
                  resolve(res)
                } else {
                  reject(res)
                }
              }
            )
          })
      )
    }
    const pool = new ConcurrencyPromisePool(maxDownloadFileCount)
    pool.all(promises).catch(error => {
      this.logParam(error, 'downloadBucketFile')
    })
    return true
  }
}

export default WebdavplistApi
