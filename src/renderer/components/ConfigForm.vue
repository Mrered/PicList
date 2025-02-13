<template>
  <div id="config-form" :class="props.colorMode === 'white' ? 'white' : ''">
    <el-form ref="$form" label-position="left" label-width="50%" :model="ruleForm" size="small">
      <el-form-item :label="$T('UPLOADER_CONFIG_NAME')" required prop="_configName">
        <el-input v-model="ruleForm._configName" type="input" :placeholder="$T('UPLOADER_CONFIG_PLACEHOLDER')" />
      </el-form-item>
      <!-- dynamic config -->
      <el-form-item
        v-for="(item, index) in configList"
        :key="item.name + index"
        :required="item.required"
        :prop="item.name"
      >
        <template #label>
          <el-row align="middle">
            {{ item.alias || item.name }}
            <template v-if="item.tips">
              <el-tooltip class="item" effect="dark" placement="right" :persistent="false" teleported>
                <template #content>
                  <span class="config-form-common-tips" v-html="transformMarkdownToHTML(item.tips)" />
                </template>
                <el-icon class="ml-[4px] cursor-pointer hover:text-blue">
                  <InfoFilled />
                </el-icon>
              </el-tooltip>
            </template>
          </el-row>
        </template>
        <el-input
          v-if="item.type === 'input' || item.type === 'password'"
          v-model="ruleForm[item.name]"
          type="input"
          :placeholder="item.message || item.name"
        />
        <el-select
          v-else-if="item.type === 'list' && item.choices"
          v-model="ruleForm[item.name]"
          :placeholder="item.message || item.name"
          :persistent="false"
          teleported
        >
          <el-option
            v-for="choice in item.choices"
            :key="choice.name || choice.value || choice"
            :label="choice.name || choice.value || choice"
            :value="choice.value || choice"
          />
        </el-select>
        <el-select
          v-else-if="item.type === 'checkbox' && item.choices"
          v-model="ruleForm[item.name]"
          :placeholder="item.message || item.name"
          multiple
          collapse-tags
          :persistent="false"
          teleported
        >
          <el-option
            v-for="choice in item.choices"
            :key="choice.value || choice"
            :label="choice.name || choice.value || choice"
            :value="choice.value || choice"
          />
        </el-select>
        <el-switch
          v-else-if="item.type === 'confirm'"
          v-model="ruleForm[item.name]"
          :active-text="item.confirmText || 'yes'"
          :inactive-text="item.cancelText || 'no'"
        />
      </el-form-item>
      <slot />
    </el-form>
  </div>
</template>

<script lang="ts" setup>
import type { FormInstance } from 'element-plus'
import { cloneDeep, union } from 'lodash'
import { marked } from 'marked'
import { reactive, ref, watch, toRefs } from 'vue'
import { useRoute } from 'vue-router'
import { InfoFilled } from '@element-plus/icons-vue'

import { getConfig } from '@/utils/dataSender'

interface IProps {
  config: any[]
  type: 'uploader' | 'transformer' | 'plugin'
  id: string
  colorMode?: 'white' | 'dark'
}

const props = defineProps<IProps>()
const $route = useRoute()
const $form = ref<FormInstance>()

const configList = ref<IPicGoPluginConfig[]>([])
const ruleForm = reactive<IStringKeyMap>({})

watch(
  toRefs(props.config),
  (val: IPicGoPluginConfig[]) => {
    handleConfigChange(val)
  },
  {
    deep: true,
    immediate: true
  }
)

function handleConfigChange(val: any) {
  handleConfig(val)
}

async function validate(): Promise<IStringKeyMap | false> {
  return new Promise(resolve => {
    $form.value?.validate((valid: boolean) => {
      if (valid) {
        resolve(ruleForm)
      } else {
        resolve(false)
      }
    })
  })
}

function transformMarkdownToHTML(markdown: string) {
  try {
    return marked.parse(markdown)
  } catch (e) {
    return markdown
  }
}

function getConfigType() {
  switch (props.type) {
    case 'plugin': {
      return props.id
    }
    case 'uploader': {
      return `picBed.${props.id}`
    }
    case 'transformer': {
      return `transformer.${props.id}`
    }
    default:
      return 'unknown'
  }
}

async function handleConfig(val: IPicGoPluginConfig[]) {
  const config = await getCurConfigFormData()
  const configId = $route.params.configId
  Object.assign(ruleForm, config)
  if (val.length > 0) {
    configList.value = cloneDeep(val).map(item => {
      if (!configId) return item
      let defaultValue = item.default !== undefined ? item.default : item.type === 'checkbox' ? [] : null
      if (item.type === 'checkbox') {
        const defaults =
          item.choices
            ?.filter((i: any) => {
              return i.checked
            })
            .map((i: any) => i.value) || []
        defaultValue = union(defaultValue, defaults)
      }
      if (config && config[item.name] !== undefined) {
        defaultValue = config[item.name]
      }
      ruleForm[item.name] = defaultValue
      return item
    })
  }
}

async function getCurConfigFormData() {
  const configId = $route.params.configId
  const curTypeConfigList = (await getConfig<IStringKeyMap[]>(`uploader.${props.id}.configList`)) || []
  return curTypeConfigList.find(i => i._id === configId) || {}
}

function updateRuleForm(key: string, value: any) {
  try {
    ruleForm[key] = value
  } catch (e) {
    console.log(e)
  }
}

defineExpose({
  updateRuleForm,
  validate,
  getConfigType
})
</script>
<style lang="stylus">
.config-form-common-tips
  a
    color #409EFF
    text-decoration none
#config-form
  .el-form
    label
      line-height 22px
      padding-bottom 0
    &-item
      display: flex
      justify-content space-between
      border-bottom 1px solid darken(#eee, 50%)
      padding-bottom 16px
      &:last-child
        border-bottom none
      &__content
        justify-content flex-end
    .el-button-group
      width 100%
      .el-button
        width 50%
    .el-radio-group
      margin-left 25px
    .el-switch__label
      &.is-active
        color #409EFF
  &.white
    .el-form-item
      border-bottom 1px solid #ddd
</style>
