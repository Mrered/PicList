import { IpcMainEvent } from 'electron'
import fs from 'fs-extra'
import path from 'path'

import { dbPathChecker } from '@core/datastore/dbChecker'
import { GalleryDB, DB_PATH } from '@core/datastore'

import { sendToolboxResWithType } from '~/events/rpc/routes/toolbox/utils'
import { T } from '~/i18n'

import { IToolboxItemCheckStatus, IToolboxItemType } from '#/types/enum'

export const checkFileMap: IToolboxCheckerMap<
  IToolboxItemType.IS_CONFIG_FILE_BROKEN | IToolboxItemType.IS_GALLERY_FILE_BROKEN
> = {
  [IToolboxItemType.IS_CONFIG_FILE_BROKEN]: async (event: IpcMainEvent) => {
    const sendToolboxRes = sendToolboxResWithType(IToolboxItemType.IS_CONFIG_FILE_BROKEN)
    sendToolboxRes(event, {
      status: IToolboxItemCheckStatus.LOADING
    })
    const configFilePath = dbPathChecker()
    try {
      if (fs.existsSync(configFilePath)) {
        await fs.readJSON(configFilePath)
        sendToolboxRes(event, {
          status: IToolboxItemCheckStatus.SUCCESS,
          msg: T('TOOLBOX_CHECK_CONFIG_FILE_PATH_TIPS', {
            path: configFilePath
          }),
          value: configFilePath
        })
      }
    } catch (e) {
      sendToolboxRes(event, {
        status: IToolboxItemCheckStatus.ERROR,
        msg: T('TOOLBOX_CHECK_CONFIG_FILE_BROKEN_TIPS'),
        value: path.dirname(configFilePath)
      })
    }
  },
  [IToolboxItemType.IS_GALLERY_FILE_BROKEN]: async event => {
    const sendToolboxRes = sendToolboxResWithType(IToolboxItemType.IS_GALLERY_FILE_BROKEN)
    sendToolboxRes(event, {
      status: IToolboxItemCheckStatus.LOADING
    })
    const galleryDB = GalleryDB.getInstance()
    if (galleryDB.errorList.length === 0) {
      sendToolboxRes(event, {
        status: IToolboxItemCheckStatus.SUCCESS,
        msg: T('TOOLBOX_CHECK_GALLERY_FILE_PATH_TIPS', {
          path: DB_PATH
        }),
        value: path.dirname(DB_PATH)
      })
    } else {
      sendToolboxRes(event, {
        status: IToolboxItemCheckStatus.ERROR,
        msg: T('TOOLBOX_CHECK_GALLERY_FILE_BROKEN_TIPS'),
        value: path.dirname(DB_PATH)
      })
    }
  }
}

export const fixFileMap: IToolboxFixMap<
  IToolboxItemType.IS_CONFIG_FILE_BROKEN | IToolboxItemType.IS_GALLERY_FILE_BROKEN
> = {
  [IToolboxItemType.IS_CONFIG_FILE_BROKEN]: async () => {
    try {
      fs.unlinkSync(dbPathChecker())
    } catch (e) {
      // do nothing
    }
    return {
      type: IToolboxItemType.IS_CONFIG_FILE_BROKEN,
      status: IToolboxItemCheckStatus.SUCCESS
    }
  },
  [IToolboxItemType.IS_GALLERY_FILE_BROKEN]: async () => {
    try {
      fs.unlinkSync(DB_PATH)
    } catch (e) {
      // do nothing
    }
    return {
      type: IToolboxItemType.IS_GALLERY_FILE_BROKEN,
      status: IToolboxItemCheckStatus.SUCCESS
    }
  }
}
