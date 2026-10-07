import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog.jsx';
import {autoCheckEnabled,checkedToday,currentVersion,installPublicUpdate,isPublicEdition,latestPublicUpdate,markCheckedToday} from '../app-update.js';
import {isNative} from '../storage.js';

const AppUpdate=forwardRef(function AppUpdate(_props,ref){
  const busy=useRef(false);
  const lastProgressAt=useRef(0);
  const [offer,setOffer]=useState(null);
  const [downloading,setDownloading]=useState(false);
  const [progress,setProgress]=useState(null);
  const [downloadError,setDownloadError]=useState('');
  const [now,setNow]=useState(0);
  useEffect(()=>{if(!downloading)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[downloading]);
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
  async function close(){if(downloading)return;setOffer(null);setProgress(null);setDownloadError('');try{await markCheckedToday();}catch{}}
  async function install(){
    if(!offer||downloading)return;
    lastProgressAt.current=Date.now();setNow(Date.now());setProgress({phase:'connecting',downloadedBytes:0,totalBytes:-1,speedBytesPerSecond:0});setDownloadError('');setDownloading(true);
    try{
      await markCheckedToday();
      await installPublicUpdate(offer,event=>{lastProgressAt.current=Date.now();setProgress(event);});
      setOffer(null);
    }catch(error){setDownloadError(error.message||'下载或安装未完成，请检查网络后重试');}
    finally{setDownloading(false);}
  }
  const total=progress?.totalBytes||0,downloaded=progress?.downloadedBytes||0;
  const stalled=downloading&&['connecting','downloading'].includes(progress?.phase)&&now-lastProgressAt.current>=15000;
  const percent=total>0?Math.min(100,Math.floor(downloaded/total*100)):null;
  const formatBytes=value=>value>=1048576?`${(value/1048576).toFixed(1)} MB`:value>=1024?`${(value/1024).toFixed(1)} KB`:`${value} B`;
  return <Dialog open={!!offer} onOpenChange={open=>{if(!open)close();}}><DialogContent className="app-dialog confirm-dialog app-update-dialog" aria-busy={downloading} forceBackdrop>
    <DialogTitle>发现新版本 {offer?.version}</DialogTitle>
    <DialogDescription>当前 {currentVersion}。{isPublicEdition?'下载后由系统确认安装。':'更新后将切换公开版；开发者配置不可用，业务数据保留。'}</DialogDescription>
    {downloading&&<div className="app-update-progress"><p aria-live="polite">{progress?.phase==='verifying'?'下载完成，正在校验安装包…':progress?.phase==='installing'?'校验通过，正在打开系统安装界面…':stalled?'下载暂无进展，请检查网络；超时后可重试。':progress?.phase==='connecting'?'正在连接下载服务器…':'正在下载安装包…'}</p>{progress?.phase==='downloading'&&<><progress aria-label="安装包下载进度" max="100" value={percent??undefined}/><small>{total>0?`${percent}% · ${formatBytes(downloaded)} / ${formatBytes(total)}`:`已下载 ${formatBytes(downloaded)}`} · {now-lastProgressAt.current>2000?'0 B/s':`${formatBytes(progress.speedBytesPerSecond||0)}/s`}</small></>}</div>}
    {downloadError&&<p className="app-update-error" role="alert">{downloadError}。可重新下载。</p>}
    <div className="actions"><button className="outline" disabled={downloading} onClick={close}>暂不更新</button><button className="primary" disabled={downloading} onClick={install}>{downloading?'正在处理…':downloadError?'重试下载':isPublicEdition?'下载更新':'下载并切换公开版'}</button></div>
  </DialogContent></Dialog>;
});
export default AppUpdate;
