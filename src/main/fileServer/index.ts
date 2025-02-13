import http from 'http'
import fs from 'fs-extra'
import path from 'path'

import picgo from '@core/picgo'
import logger from '@core/picgo/logger'

export const imgFilePath = path.join(picgo.baseDir, 'imgTemp')
fs.ensureDirSync(imgFilePath)

const serverPort = 36699

let server: http.Server

export function startFileServer() {
  server = http.createServer((req, res) => {
    const requestPath = req.url?.split('?')[0]
    const filePath = path.join(imgFilePath, decodeURIComponent(requestPath as string))

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end('404 Not Found')
      } else {
        res.end(data)
      }
    })
  })

  server
    .listen(serverPort, () => {
      logger.info(`File server is running, http://localhost:${serverPort}`)
    })
    .on('error', err => {
      logger.error(err)
    })
}

export function stopFileServer() {
  server.close(() => {
    logger.info('File server is stopped')
  })
}
