import {useEffect,useRef,useState} from 'react';
import {Alert,AutoComplete,Button,Card,Form,Input,InputNumber,Modal,Select,Space,Tag,Tooltip} from 'antd';
import {useTranslation} from 'react-i18next';
import {api,ApiError,type Reference} from '../api';
import {ErrorBox,Language} from '../components';
import {useLocaleValidation} from '../useLocaleValidation';
import type {AccountList} from './types';

export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function cash(value:string|number|undefined|null){const [whole,fraction='']=String(value??'0').split('.');return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${fraction.padEnd(2,'0')}`;}
export function query(params:Record<string,unknown>){return new URLSearchParams(Object.entries(params).filter(([,v])=>v!==''&&v!==undefined&&v!==null).map(([k,v])=>[k,String(v)])).toString();}
export function useResource<T>(path:string){
 const [data,setData]=useState<T>(),[error,setError]=useState(''),[loading,setLoading]=useState(true),[tick,setTick]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError('');setData(undefined);api<T>(path).then(value=>{if(live)setData(value);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[path,tick]);
 return {data,error,loading,refresh:()=>setTick(n=>n+1)};
}
export function useCommand(){
 const pending=useRef<{signature:string;key:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [fields,setFields]=useState<unknown>();
 async function send<T=unknown>(path:string,data:Record<string,unknown>,method='POST'):Promise<T>{
  const signature=JSON.stringify({path,data,method});
  if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()};
  setBusy(true);setError('');setFields(undefined);
  try{const result=await api<T>(path,method,{...data,request_id:pending.current.key});pending.current=null;return result;}
  catch(e){setError(e instanceof Error?e.message:'errors.server_error');if(e instanceof ApiError)setFields(e.fields);throw e;}
  finally{setBusy(false);}
 }
 return {send,busy,error,fields};
}
export function CommandErrors({command}:{command:{error:string;fields:unknown}}){
 const {t}=useTranslation();const issues:{path:string[];message:string}[]=[];
 const visit=(value:unknown,path:string[])=>{if(typeof value==='string')issues.push({path,message:value});else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>visit(v,[...path,...(Array.isArray(value)&&typeof v==='string'?[]:[k])]));};
 visit(command.fields,[]);
 return <><ErrorBox error={command.error}/>{issues.length>0&&<Alert type="error" className="spaced" message={<ul>{issues.map((issue,i)=><li key={i}>{issue.path.map(key=>/^\d+$/.test(key)?String(Number(key)+1):t(`biz.${key}`,{defaultValue:t(key,{defaultValue:key})})).join(' / ')}: {t(`errors.${issue.message}`,{defaultValue:t('biz.invalidField')})}</li>)}</ul>}/>}</>;
}
export function ReferenceInput({kind,value,onChange}:{kind:string;value?:string;onChange?:(value:string)=>void}){
 const {t,i18n}=useTranslation();const r=useResource<Reference[]>('reference/?kind='+kind);
 return <div><AutoComplete style={{width:'100%'}} value={value} onChange={value=>onChange?.(value.slice(0,160))} options={(r.data||[]).filter(row=>row.is_active).map(row=>({value:row.name,label:i18n.language==='en'?`${row.name_en||row.name} · ${row.name}`:row.name}))} filterOption={(input,option)=>String(option?.label||'').toLowerCase().includes(input.toLowerCase())}><Input/></AutoComplete>{r.error&&<small>{t('biz.suggestionsUnavailable')}</small>}</div>;
}
function compactNumber(value:unknown){const number=Number(value);if(!Number.isFinite(number)||Math.abs(number)<1000)return String(value??'');const units=[['B',1e9],['M',1e6],['K',1e3]] as const;const [suffix,divisor]=units.find(([,size])=>Math.abs(number)>=size)??units[2];const fixed=(number/divisor).toFixed(Math.abs(number/divisor)>=100?0:Math.abs(number/divisor)>=10?1:2);return `${fixed.includes('.')?fixed.replace(/0+$/,'').replace(/\.$/,''):fixed}${suffix}`;}
export function MoneyInput({precision=2,compact=false,value,...rest}:{precision?:number;compact?:boolean;value?:string;[key:string]:unknown}){const [focused,setFocused]=useState(false);const exact=String(value??'');return <Tooltip title={compact&&exact?exact:null}><InputNumber<string> stringMode min="0" precision={precision} value={value} formatter={compact&&!focused?value=>compactNumber(value):undefined} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={{width:'100%'}} {...rest}/></Tooltip>;}
export function Status({value}:{value:string}){const {t}=useTranslation();return <Tag color={value==='overdue'?'red':value==='settled'?'green':value==='partial'?'gold':value==='pending'?'blue':'default'}>{t(`biz.${value}`)}</Tag>;}
export function Metrics({data,keys}:{data:Record<string,unknown>|object;keys:string[]}){const {t}=useTranslation();return <div className="business-metrics">{keys.map(key=>{const value=(data as Record<string,unknown>)[key];const count=key.endsWith('_count')||key==='partial_receipts';return <Card key={key}><span>{t(`biz.${key}`)}</span><strong className={String(value).startsWith('-')?'negative':''}>{count?String(value??0):cash(value as string)}</strong></Card>;})}</div>;}
export function AccountSelect(){const {t}=useTranslation();const r=useResource<AccountList>('trading/accounts/');return <><ErrorBox error={r.error} retry={r.refresh}/><Select allowClear loading={r.loading} placeholder={t('biz.defaultAccount')} options={(r.data?.results||[]).filter(a=>a.is_active).map(a=>({value:a.id,label:`${a.name}${a.is_default?' · '+t('biz.default'):''}`}))}/></>;}
// Form.Item needs a direct value/onChange-aware child, not a wrapper Fragment.
export function AccountField({value,onChange}:{value?:number;onChange?:(value:number|undefined)=>void}){const {t}=useTranslation();const r=useResource<AccountList>('trading/accounts/');return <div><ErrorBox error={r.error} retry={r.refresh}/><Select style={{width:'100%'}} value={value} onChange={onChange} allowClear loading={r.loading} placeholder={t('biz.defaultAccount')} options={(r.data?.results||[]).filter(a=>a.is_active).map(a=>({value:a.id,label:`${a.name}${a.is_default?' · '+t('biz.default'):''}`}))}/></div>;}
export function ReasonDialog({title,hint,onClose,onSubmit,clear=false,date=false}:{title:string;hint:string;onClose:()=>void;onSubmit:(values:Record<string,unknown>)=>Promise<unknown>;clear?:boolean;date?:boolean}){
 const {t}=useTranslation();const [form]=Form.useForm();useLocaleValidation(form);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Modal open title={<Space>{title}<Language/></Space>} onCancel={()=>{if(!busy)onClose();}} footer={null}><Alert type="warning" message={hint}/><ErrorBox error={error}/><Form form={form} layout="vertical" initialValues={{date:today()}} onFinish={async values=>{setBusy(true);setError('');try{await onSubmit(values);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 {date&&<Form.Item name="date" label={t('biz.date')} rules={[{required:true,message:t('required')}]}><Input type="date" max={today()}/></Form.Item>}
 <Form.Item name="reason" label={t('biz.reason')} rules={[{required:true,whitespace:true,message:t('required')}]}><Input.TextArea maxLength={1000}/></Form.Item>
 {clear&&<Form.Item name="confirmation" label={t('biz.confirmation')} rules={[{validator:(_,value)=>value==='CLEAR'?Promise.resolve():Promise.reject(new Error(t('biz.confirmation')))}]}><Input/></Form.Item>}
 <Button type="primary" danger htmlType="submit" loading={busy}>{t('biz.confirm')}</Button></Form></Modal>;
}
export async function downloadLedger(params:Record<string,unknown>){
 const res=await fetch('/api/trading/ledger/export/?'+query(params),{credentials:'same-origin'});
 if(!res.ok){const body=await res.json().catch(()=>({code:'server_error'}));if(['session_expired','not_authenticated'].includes(body.code))window.dispatchEvent(new Event('session-ended'));throw new ApiError(body.code,res.status);}
 const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ledger_${today()}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

