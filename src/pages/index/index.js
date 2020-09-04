/*
 * @Autor: lycheng
 * @Date: 2020-01-13 16:12:22
 */
/**
 * Created by iflytek on 2019/11/19.
 *
 * 在线语音合成调用demo
 * 此demo只是一个简单的调用示例，不适合用到实际生产环境中
 *
 * 在线语音合成 WebAPI 接口调用示例 接口文档（必看）：https://www.xfyun.cn/doc/tts/online_tts/API.html
 * 错误码链接：
 * https://www.xfyun.cn/doc/tts/online_tts/API.html
 * https://www.xfyun.cn/document/error-code （code返回错误码时必看）
 *
 */

// 1. websocket连接：判断浏览器是否兼容，获取websocket url并连接，这里为了方便本地生成websocket url
// 2. 连接websocket，向websocket发送数据，实时接收websocket返回数据
// 3. 处理websocket返回数据为浏览器可以播放的音频数据
// 4. 播放音频数据
// ps: 该示例用到了es6中的一些语法，建议在chrome下运行
import {downloadPCM, downloadWAV} from 'js/download.js'
import CryptoJS from 'crypto-js'
import Enc from 'enc'
import TransWorker from 'js/transcode.worker.js'
import VConsole from 'vconsole'
import { Base64 } from 'js-base64'
import './index.css'
import './common.css'

let transWorker = new TransWorker()
//APPID，APISecret，APIKey在控制台-我的应用-语音合成（流式版）页面获取
const APPID = '5f39eb1b'
const API_SECRET = '9c3916743d0f01f621ac8855cce70f95'
const API_KEY = '641f188a31e1b133adeba30979646886'

function getWebsocketUrl() {
  return new Promise((resolve, reject) => {
    var apiKey = API_KEY
    var apiSecret = API_SECRET
    var url = 'wss://tts-api.xfyun.cn/v2/tts'
    var host = location.host
    var date = new Date().toGMTString()
    var algorithm = 'hmac-sha256'
    var headers = 'host date request-line'
    var signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/tts HTTP/1.1`
    var signatureSha = CryptoJS.HmacSHA256(signatureOrigin, apiSecret)
    var signature = CryptoJS.enc.Base64.stringify(signatureSha)
    var authorizationOrigin = `api_key="${apiKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`
    var authorization = btoa(authorizationOrigin)
    url = `${url}?authorization=${authorization}&date=${date}&host=${host}`
    resolve(url)
  })
}
class TTSRecorder {
  constructor({
    speed = 50,
    voice = 50,
    pitch = 50,
    voiceName = 'xiaoyan',
    appId = APPID,
    text = '',
    tte = 'UTF8',
    defaultText = '请输入您要合成的文本',
  } = {}) {
    this.speed = speed
    this.voice = voice
    this.pitch = pitch
    this.voiceName = voiceName
    this.text = text
    this.tte = tte
    this.defaultText = defaultText
    this.appId = appId
    this.audioData = []
    this.rawAudioData = []
    this.audioDataOffset = 0
    this.status = 'init'
    transWorker.onmessage = (e) => {
      this.audioData.push(...e.data.data)
      this.rawAudioData.push(...e.data.rawAudioData)
    }
  }
  // 修改录音听写状态
  setStatus(status) {
    this.onWillStatusChange && this.onWillStatusChange(this.status, status)
    this.status = status
  }
  // 设置合成相关参数
  setParams({ speed, voice, pitch, text, voiceName, tte }) {
    speed !== undefined && (this.speed = speed)
    voice !== undefined && (this.voice = voice)
    pitch !== undefined && (this.pitch = pitch)
    text && (this.text = text)
    tte && (this.tte = tte)
    voiceName && (this.voiceName = voiceName)
    this.resetAudio()
  }
  // 连接websocket
  connectWebSocket() {
    this.setStatus('ttsing')
    return getWebsocketUrl().then(url => {
      let ttsWS
      if ('WebSocket' in window) {
        ttsWS = new WebSocket(url)
      } else if ('MozWebSocket' in window) {
        ttsWS = new MozWebSocket(url)
      } else {
        alert('浏览器不支持WebSocket')
        return
      }
      this.ttsWS = ttsWS
      ttsWS.onopen = e => {
        this.webSocketSend()
        this.playTimeout = setTimeout(() => {
          this.audioPlay()
        }, 1000)
      }
      ttsWS.onmessage = e => {
        this.result(e.data)
      }
      ttsWS.onerror = e => {
        clearTimeout(this.playTimeout)
        this.setStatus('errorTTS')
        alert('WebSocket报错，请f12查看详情')
        console.error(`详情查看：${encodeURI(url.replace('wss:', 'https:'))}`)
      }
      ttsWS.onclose = e => {
        console.log(e)
      }
    })
  }
  // 处理音频数据
  transToAudioData(audioData) {}
  // websocket发送数据
  webSocketSend() {
    var params = {
      common: {
        app_id: this.appId, // APPID
      },
      business: {
        aue: 'raw',//'lame',
        //sfl:1,
        auf: 'audio/L16;rate=16000',
        vcn: this.voiceName,
        speed: this.speed,
        volume: this.voice,
        pitch: this.pitch,
        bgs: 1,
        tte: this.tte,
      },
      data: {
        status: 2,
        text: this.encodeText(
          this.text || this.defaultText,
          this.tte === 'unicode' ? 'base64&utf16le' : ''
        )
      },
    }
    this.ttsWS.send(JSON.stringify(params))
  }
  encodeText (text, encoding) {
    switch (encoding) {
      case 'utf16le' : {
        let buf = new ArrayBuffer(text.length * 4)
        let bufView = new Uint16Array(buf)
        for (let i = 0, strlen = text.length; i < strlen; i++) {
          bufView[i] = text.charCodeAt(i)
        }
        return buf
      }
      case 'buffer2Base64': {
        let binary = ''
        let bytes = new Uint8Array(text)
        let len = bytes.byteLength
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        return window.btoa(binary)
      }
      case 'base64&utf16le' : {
        return this.encodeText(this.encodeText(text, 'utf16le'), 'buffer2Base64')
      }
      default : {
        return Base64.encode(text)
      }
    }
  }
  // websocket接收数据的处理
  result(resultData) {
    let jsonData = JSON.parse(resultData)
    // 合成失败
    if (jsonData.code !== 0) {
      alert(`合成失败: ${jsonData.code}:${jsonData.message}`)
      console.error(`${jsonData.code}:${jsonData.message}`)
      this.resetAudio()
      return
    }
    transWorker.postMessage(jsonData.data.audio)

    if (jsonData.code === 0 && jsonData.data.status === 2) {
      this.ttsWS.close()
    }
  }
  // 重置音频数据
  resetAudio() {
    this.audioStop()
    this.setStatus('init')
    this.audioDataOffset = 0
    this.audioData = []
    this.rawAudioData = []
    this.ttsWS && this.ttsWS.close()
    clearTimeout(this.playTimeout)
  }
  // 音频初始化
  audioInit() {
    let AudioContext = window.AudioContext || window.webkitAudioContext
    if (AudioContext) {
      this.audioContext = new AudioContext()
      this.audioContext.resume()
      this.audioDataOffset = 0
    } 
  }
  // 音频播放
  audioPlay() {
    this.setStatus('play')
    let audioData = this.audioData.slice(this.audioDataOffset)
    this.audioDataOffset += audioData.length
    let audioBuffer = this.audioContext.createBuffer(1, audioData.length, 22050)
    let nowBuffering = audioBuffer.getChannelData(0)
    if (audioBuffer.copyToChannel) {
      audioBuffer.copyToChannel(new Float32Array(audioData), 0, 0)
    } else {
      for (let i = 0; i < audioData.length; i++) {
        nowBuffering[i] = audioData[i]
      }
    }
    let bufferSource = this.bufferSource = this.audioContext.createBufferSource()
    bufferSource.buffer = audioBuffer
    bufferSource.connect(this.audioContext.destination)
    bufferSource.start()
    bufferSource.onended = event => {
      if (this.status !== 'play') {
        return
      }
      if (this.audioDataOffset < this.audioData.length) {
        this.audioPlay()
      } else {
        this.audioStop()
      }
    }
  }
  // 音频播放结束
  audioStop() {
    this.setStatus('endPlay')
    clearTimeout(this.playTimeout)
    this.audioDataOffset = 0
    if (this.bufferSource) {
      try {
        this.bufferSource.stop()
      } catch (e) {
        console.log(e)
      }
    }
  }
  start() {
    if(this.audioData.length) {
      this.audioPlay()
    } else {
      if (!this.audioContext) {
        this.audioInit()
      }
      if (!this.audioContext) {
        alert('该浏览器不支持webAudioApi相关接口')
        return
      }
      this.connectWebSocket()
    }
  }
  stop() {
    this.audioStop()
  }
}

// ======================开始调用=============================
var vConsole = new VConsole()
let ttsRecorder = new TTSRecorder()
ttsRecorder.onWillStatusChange = function(oldStatus, status) {
  // 可以在这里进行页面中一些交互逻辑处理：按钮交互等
  // 按钮中的文字
  let btnState = {
    init: '立即合成',
    ttsing: '正在合成',
    play: '停止播放',
    endPlay: '重新播放',
    errorTTS: '合成失败',
  }
  $('.audio-ctrl-btn')
    .removeClass(oldStatus)
    .addClass(status)
    .text(btnState[status])
}

$('.ex-speaker').click(function(e){
  $(this).addClass("active");
  $(this).siblings().removeClass("active");
  let checked = $(this).attr("data-index")
  let text
  if (checked==0) {
    text = '正在为您查询西安的天气情况。今天是2020年8月24日，西安市今天多云，最低温度19摄氏度，最高温度32摄氏度，微风。'
    ttsRecorder.setParams({
      voiceName: 'x2_yezi', 
      tte: 'unicode',
      text: text
    })
  } else if(checked==1){
    text = '在已经过去的2001年，人类已经在太空中建立起壮丽的城市，在月球上建立起永久性的殖民地，巨大的核动力飞船已经航行到土星。而在现实中的2018年，再也没有人登上月球，人类的太空中航行的最远的距离，也就是途经我所在的城市的高速列车两个小时的里程。'
    ttsRecorder.setParams({ 
      voiceName: 'aisjiuxu', 
      tte: 'UTF8',
      text: text
    })
  } else if(checked==2){
    text = '布娃娃，别生气。布娃娃，你别生气，我来给你赔个礼。刚才不该发脾气，使劲把你扔在地。弄脏了你的新花衣，摔得你脸上都是泥。一定还很疼吧?真是对不起！衣服脏了我给你拍，脸儿脏了我给你洗，从今以后，我要爱护你。'
    ttsRecorder.setParams({ 
      voiceName: 'aisxping', 
      tte: 'UTF8',
      text: text
    })
  } else if(checked==3){
    text = '正在为您查询西安的天气情况。今天是2020年8月24日，西安市今天多云，最低温度19摄氏度，最高温度32摄氏度，微风。'
    ttsRecorder.setParams({ 
      voiceName: 'aisjinger', 
      tte: 'UTF8',
      text: text
    })
  } else if(checked==4){
    text = '这本书的作者是来自于Harvard University的 Stephen curry，Stephen curry在他的书中提出了一种LSTM模型，这个LSTM模型很好的解释了wave-particle duality 现象。'
    ttsRecorder.setParams({ 
      voiceName: 'aisbabyxu', 
      tte: 'UTF8',
      text: text
    })
  } else if(checked==5){
    text = '长城是古代中国在不同时期，为抵御塞北游牧部落侵袭而修筑的规模浩大的军事工程。长城绵延上万华里，因此又称作万里长城。现存的长城遗迹，西起嘉峪关，东至辽东虎山，全长8851.8公里，平均高6至7米、宽4至5米。长城是我国古代劳动人民创造的伟大的奇迹，是中国古代人民智慧的结晶，是中国悠久历史的见证。它与天安门，兵马俑一起被世人视为中国的象征。长城欢迎您！。'
    ttsRecorder.setParams({ 
      voiceName: 'xiaoyan', 
      tte: 'UTF8',
      text: text
    })
  }
  $('#input_text').val(text)
})
$('.audio-ctrl-btn').click(function() {
  if (['init', 'endPlay', 'errorTTS'].indexOf(ttsRecorder.status) > -1) {
    ttsRecorder.start()
  } else {
    ttsRecorder.stop()
  }
})
$('.download-wav').click(function(){
  if (ttsRecorder.rawAudioData.length){
    downloadWAV(new DataView(new Int16Array(ttsRecorder.rawAudioData).buffer), 16000, 16)
  } else {
    alert('请先合成')
  }
})
$('.download-pcm').click(function(){
  if (ttsRecorder.rawAudioData.length){
    downloadPCM(new Int16Array(ttsRecorder.rawAudioData))
  } else {
    alert('请先合成')
  }
})
$('#input_text').change(function(){
  ttsRecorder.setParams({
    text: this.value
  })
})