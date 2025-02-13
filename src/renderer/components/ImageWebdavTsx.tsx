import { ElImage, ElIcon } from 'element-plus'
import { defineComponent, ref, onMounted, watch, computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'

import { getFileIconPath } from '@/manage/utils/common'
import { getAuthHeader } from '@/manage/utils/digestAuth'

import { formatEndpoint } from '#/utils/common'

export default defineComponent({
  props: {
    isShowThumbnail: {
      type: Boolean,
      required: true
    },
    item: {
      type: Object,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    config: {
      type: Object,
      required: true
    }
  },

  setup(props) {
    const base64Url = ref('')
    const success = ref(false)

    const imageSource = computed(() => {
      return props.isShowThumbnail && props.item.isImage && success.value
        ? base64Url.value
        : require(`../manage/pages/assets/icons/${getFileIconPath(props.item.fileName ?? '')}`)
    })
    const iconPath = computed(() =>
      require(`../manage/pages/assets/icons/${getFileIconPath(props.item.fileName ?? '')}`)
    )

    async function getWebdavHeader(key: string) {
      let headers = {} as any
      if (props.config.authType === 'digest') {
        const authHeader = await getAuthHeader(
          'GET',
          formatEndpoint(props.config.endpoint, props.config.sslEnabled || false),
          `/${key.replace(/^\//, '')}`,
          props.config.username,
          props.config.password
        )
        headers = {
          Authorization: authHeader
        }
      } else {
        headers = {
          Authorization: 'Basic ' + Buffer.from(`${props.config.username}:${props.config.password}`).toString('base64')
        }
      }
      return headers
    }

    const fetchImage = async () => {
      try {
        const headers = await getWebdavHeader(props.item.key)
        const res = await fetch(props.url, { method: 'GET', headers })
        if (res.status >= 200 && res.status < 300) {
          const blob = await res.blob()
          success.value = true
          base64Url.value = URL.createObjectURL(blob)
        } else {
          throw new Error('Network response was not ok.')
        }
      } catch (err) {
        success.value = false
        console.log(err)
      }
    }
    watch(() => [props.url, props.item], fetchImage, { deep: true })
    onMounted(fetchImage)

    return () => (
      <ElImage src={imageSource.value} fit='contain' style='height: 100px;width: 100%;margin: 0 auto;'>
        {{
          placeholder: () => (
            <ElIcon>
              <Loading />
            </ElIcon>
          ),
          error: () => <ElImage src={iconPath.value} fit='contain' style='height: 100px;width: 100%;margin: 0 auto;' />
        }}
      </ElImage>
    )
  }
})
