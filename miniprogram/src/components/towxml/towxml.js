Component({
  options:{
    styleIsolation:'shared'
  },
  properties:{
    nodes:{
      type:Object,
      value:{}
    }
  },
  data:{
    someData:{

    }
  },
  methods:{
    /**
     * 节点点击处理（decode.wxml 中所有节点均绑定 catch:tap="_tap"）。
     * 链接节点在 parse 阶段已由 <a> 转换为 <navigator>：
     * - http(s) 外链：小程序无法直接打开外部网页（web-view 需企业主体+业务域名），
     *   采取「复制链接 + 提示去浏览器打开」的通用方案；
     * - 站内路径（/pages/...）：直接页面内导航。
     */
    _tap(e){
      const node = e.currentTarget.dataset.data;
      if(!node || node.tag !== 'navigator') return;
      const href = node.attr && node.attr.href;
      if(!href) return;
      if(/^https?:\/\//i.test(href)){
        wx.setClipboardData({
          data: href,
          success(){
            wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none', duration: 2200 });
          }
        });
      } else if(href.indexOf('/pages/') === 0){
        wx.navigateTo({
          url: href,
          fail(){
            wx.showToast({ title: '无法打开该页面', icon: 'none' });
          }
        });
      }
    }
  }
})
