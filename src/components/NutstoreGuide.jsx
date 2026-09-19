import guide from './nutstoreGuide.json';

export default function NutstoreGuide(){
 return <details className="nutstore-guide">
  <summary>首次连接？查看应用密码获取图解</summary>
  <div className="nutstore-guide-body">
   <p><strong>{guide.intro}</strong></p>
   <p className="nutstore-guide-caption">{guide.caption}</p>
   <ol>{guide.steps.map(step=><li key={step.image}>
    <h4>{step.title}</h4><p>{step.text}</p>
     <img src={step.image} alt={step.alt} width="1080" height="2400" loading="lazy"/>
   </li>)}</ol>
   <p>{guide.ending}</p>
  </div>
 </details>;
}
