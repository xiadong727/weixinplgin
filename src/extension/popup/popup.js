const stateEl = document.getElementById('state')
const toggleBtn = document.getElementById('toggle')

function setState(text, kind) {
  stateEl.textContent = text
  stateEl.className = 'state' + (kind ? ` ${kind}` : '')
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function init() {
  const tab = await currentTab()
  const url = tab?.url ?? ''

  if (!/^https:\/\/mp\.weixin\.qq\.com\/cgi-bin\/appmsg/.test(url)) {
    setState('当前不是公众号图文编辑页。请先打开后台的「新建图文消息」页面。', 'warn')
    return
  }

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'wxt:ping' })
    if (res?.editor) setState('已连上正文编辑器，可以直接插入排版结果。', 'ok')
    else setState('面板已就绪，但还没识别到正文编辑器。点进正文区域后再试。', 'warn')
    toggleBtn.disabled = false
  } catch {
    // content script 还没注入（页面在扩展安装前就打开了）
    setState('面板还没注入到这个页面，刷新一下页面即可。', 'warn')
    toggleBtn.textContent = '刷新页面'
    toggleBtn.disabled = false
    toggleBtn.dataset.act = 'reload'
  }
}

toggleBtn.addEventListener('click', async () => {
  const tab = await currentTab()
  if (!tab?.id) return
  if (toggleBtn.dataset.act === 'reload') {
    await chrome.tabs.reload(tab.id)
  } else {
    await chrome.tabs.sendMessage(tab.id, { type: 'wxt:toggle' })
  }
  window.close()
})

void init()
