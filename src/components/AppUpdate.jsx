import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog.jsx';
import {autoCheckEnabled,checkedToday,currentVersion,installPublicUpdate,isPublicEdition,latestPublicUpdate,markCheckedToday} from '../app-update.js';
import {isNative} from '../storage.js';

const AppUpdate=forwardRef(function AppUpdate(_props,ref){
  const busy=useRef(false);
  const [offer,setOffer]=useState(null);
  const [downloading,setDownloading]=useState(false);
  async function check(manual=false){
    if(busy.current||offer)return;
    if(!isNative()){if(manual)toast('更新仅在 Android 应用内可用');return;}
    busy.current=true;
    try{
      if(!manual&&(!(await autoCheckEnabled())||await checkedToday()))return;
      const update=await latestPublicUpdate();
      if(update)setOffer(update);
      else{await markCheckedToday();if(manual)toast.success('当前已是最新版本');}
    }catch(error){if(manual)toast.error(error.message||'检查更新失败');}
    finally{busy.current=false;}
  }
  useImperativeHandle(ref,()=>({check:()=>check(true)}));
  useEffect(()=>{const timer=setTimeout(()=>check(),1200);return()=>clearTimeout(timer);},[]);
  async function close(){if(downloading)return;setOffer(null);try{await markCheckedToday();}catch{}}
  async function install(){
    if(!offer||downloading)return;
    setDownloading(true);
    try{
      await markCheckedToday();
      await installPublicUpdate(offer);
      setOffer(null);
    }catch(error){toast.error(error.message||'下载或安装未完成');}
    finally{setDownloading(false);}
  }
  return <Dialog open={!!offer} onOpenChange={open=>{if(!open)close();}}><DialogContent className="app-dialog confirm-dialog" aria-busy={downloading} forceBackdrop>
    <DialogTitle>发现新版本 {offer?.version}</DialogTitle>
    <DialogDescription>当前版本 {currentVersion}。{isPublicEdition?'安装包将在应用内下载，随后由系统确认安装。':'当前使用的是开发者版本。确认更新后将切换为公开版，开发者配置不再可用；不会主动清除业务数据与个人配置。安装包将在应用内下载。'}</DialogDescription>
    <div className="actions"><button className="outline" disabled={downloading} onClick={close}>暂不更新</button><button className="primary" disabled={downloading} onClick={install}>{downloading?'正在下载并校验…':isPublicEdition?'下载更新':'下载并切换公开版'}</button></div>
  </DialogContent></Dialog>;
});
export default AppUpdate;
