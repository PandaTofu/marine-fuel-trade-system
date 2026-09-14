import {useState} from 'react';
import {Alert,Button,Card,Checkbox,Form,Input,Modal,Select,Space,Table,Tabs,Tag} from 'antd';
import {useTranslation} from 'react-i18next';
import {useAuth} from '../auth';
import {api} from '../api';
import {ErrorBox,Language} from '../components';
import {useLocaleValidation} from '../useLocaleValidation';
import {AccountField,cash,CommandErrors,downloadLedger,Metrics,MoneyInput,query,ReasonDialog,today,useCommand,useResource} from './shared';
import {components,type Account,type AccountList,type Entry,type LedgerList,type Order,type Dashboard} from './types';

function AccountEditor({account,onClose,onSaved}:{account?:Account;onClose:()=>void;onSaved:()=>void}){
 const {t}=useTranslation();const [form]=Form.useForm();useLocaleValidation(form);const cmd=useCommand();
 return <Modal open title={<Space>{t(account?'biz.edit':'biz.addAccount')}<Language/></Space>} footer={null} onCancel={()=>{if(!cmd.busy)onClose();}}>
 <Alert type="info" message={t('biz.accountHint')}/><CommandErrors command={cmd}/>
 <Form form={form} layout="vertical" initialValues={account||{opening_balance:'0',is_active:true,is_default:false,note:''}} onFinish={async values=>{try{await cmd.send(`trading/accounts/${account?account.id+'/':''}`,{...values,currency:'USD',version:account?.version},account?'PATCH':'POST');onSaved();onClose();}catch{/* Keep form. */}}}>
 <Form.Item name="name" label={t('biz.accountName')} rules={[{required:true,whitespace:true,message:t('required')}]}><Input maxLength={120}/></Form.Item>
 <Form.Item name="opening_balance" label={t('biz.opening_balance')} rules={[{required:true,message:t('required')}]}><MoneyInput disabled={account?.has_entries}/></Form.Item>
 <Space><Form.Item name="is_default" valuePropName="checked"><Checkbox>{t('biz.default')}</Checkbox></Form.Item><Form.Item name="is_active" valuePropName="checked"><Checkbox>{t('active')}</Checkbox></Form.Item></Space>
 <Form.Item name="note" label={t('biz.note')}><Input.TextArea maxLength={1000}/></Form.Item>
 <Button type="primary" htmlType="submit" loading={cmd.busy}>{t('biz.save')}</Button></Form></Modal>;
}

function Accounts({onChanged}:{onChanged:()=>void}){
 const {t}=useTranslation();const {user}=useAuth();const r=useResource<AccountList>('trading/accounts/');const cmd=useCommand();
 const [editor,setEditor]=useState<Account|'new'|null>(null),[deleting,setDeleting]=useState<Account|null>(null);
 return <><ErrorBox error={r.error} retry={r.refresh}/>{r.data&&<Metrics data={r.data} keys={['total_balance']}/>}
 {r.data?.results.some(a=>a.balance.startsWith('-'))&&<Alert type="warning" message={t('biz.negativeBalance')}/>}
 <div className="business-toolbar">{user?.role==='admin'&&<Button type="primary" onClick={()=>setEditor('new')}>{t('biz.addAccount')}</Button>}</div>
 <Table<Account> rowKey="id" loading={r.loading} dataSource={r.data?.results} scroll={{x:850}} columns={[
 {title:t('biz.accountName'),dataIndex:'name',render:(v:string,a:Account)=><Space>{v}{a.is_default&&<Tag color="cyan">{t('biz.default')}</Tag>}{!a.is_active&&<Tag>{t('inactive')}</Tag>}</Space>},
 ...['opening_balance','ledger_income','ledger_expense','balance'].map(key=>({title:t(`biz.${key}`),dataIndex:key,render:(v:string)=><span className={v.startsWith('-')?'negative':''}>{cash(v)}</span>})),
 {title:t('biz.share'),dataIndex:'share',render:(v:string|null)=>v===null?'—':v+'%'},{title:t('biz.note'),dataIndex:'note'},
 {title:t('biz.action'),render:(_:unknown,a:Account)=>user?.role==='admin'&&<Space><Button onClick={()=>setEditor(a)}>{t('biz.edit')}</Button><Button danger disabled={a.has_entries} onClick={()=>setDeleting(a)}>{t('biz.delete')}</Button></Space>},
 ]}/>
 {editor&&<AccountEditor account={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={()=>{r.refresh();onChanged();}}/>}
 {deleting&&<ReasonDialog title={t('biz.delete')+' · '+deleting.name} hint={t('biz.accountDeleteHint')} onClose={()=>setDeleting(null)} onSubmit={async values=>{await cmd.send(`trading/accounts/${deleting.id}/`,{...values,version:deleting.version});r.refresh();onChanged();}}/>}
 </>;
}

const categories=['customer_receipt','supplier_payment','bank_fee','commission','berth','other_income','other_expense'];
type Option={id:number;version:number;label:string};
function EntryEditor({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const {t}=useTranslation();const [form]=Form.useForm();useLocaleValidation(form);const cmd=useCommand();const [search,setSearch]=useState(''),[chosen,setChosen]=useState<Option>();
 const orders=useResource<Option[]>('trading/orders/options/?'+query({q:search}));
 const category=Form.useWatch('category',form);const required=[{required:true,message:t('required')}];
 const needsComponent=!!chosen&&['customer_receipt','supplier_payment'].includes(category);
 return <Modal open width={720} title={<Space>{t('biz.manualEntry')}<Language/></Space>} onCancel={()=>{if(!cmd.busy)onClose();}} footer={null}>
 <Alert type="info" message={t('biz.manualHint')}/><CommandErrors command={cmd}/><ErrorBox error={orders.error}/>
 <Form form={form} layout="vertical" initialValues={{date:today(),direction:'income',category:'other_income',reason:''}} onFinish={async values=>{try{await cmd.send('trading/ledger/',{...values,order_id:chosen?.id||null,version:chosen?.version,component:needsComponent?values.component:''});onSaved();onClose();}catch{/* Preserve data and request key. */}}}>
 <div className="business-form-grid">
 <Form.Item name="account_id" label={t('biz.account')}><AccountField/></Form.Item>
 <Form.Item name="date" label={t('biz.date')} rules={required}><Input type="date" max={today()}/></Form.Item>
 <Form.Item name="category" label={t('biz.category')} rules={required}><Select options={categories.map(value=>({value,label:t(`biz.${value}`)}))} onChange={value=>{form.setFieldsValue({direction:['customer_receipt','other_income'].includes(value)?'income':'expense',component:undefined});}}/></Form.Item>
 <Form.Item name="direction" label={t('biz.direction')} rules={required}><Select disabled options={['income','expense'].map(value=>({value,label:t(`biz.${value}`)}))}/></Form.Item>
 <Form.Item name="amount" label={t('biz.amount')} rules={required}><MoneyInput/></Form.Item>
 </div>
 <Form.Item label={t('biz.relatedOrder')}><Select allowClear showSearch filterOption={false} loading={orders.loading} placeholder={t('biz.unlinked')} value={chosen?.id} onSearch={setSearch} options={[...(orders.data||[]),...(chosen&&!(orders.data||[]).some(o=>o.id===chosen.id)?[chosen]:[])].map(o=>({value:o.id,label:o.label}))} onChange={id=>{setChosen(orders.data?.find(o=>o.id===id));form.setFieldValue('component',undefined);}}/></Form.Item>
 {needsComponent&&<Form.Item name="component" label={t('biz.component')} rules={required}><Select options={components.filter(c=>c.startsWith(category==='customer_receipt'?'customer':'supplier')).map(value=>({value,label:t(`biz.${value}`)}))}/></Form.Item>}
 <Form.Item name="reason" label={t('biz.reason')}><Input.TextArea maxLength={1000}/></Form.Item>
 <Button type="primary" htmlType="submit" loading={cmd.busy}>{t('biz.save')}</Button></Form></Modal>;
}

function Ledger({onChanged}:{onChanged:()=>void}){
 const [filterForm]=Form.useForm();
 const {t,i18n}=useTranslation();const {user}=useAuth();const [filters,setFilters]=useState<Record<string,unknown>>({}),[page,setPage]=useState(1),[editor,setEditor]=useState(false),[error,setError]=useState(''),[exporting,setExporting]=useState(false),[exportLanguage,setExportLanguage]=useState<string>();
 const [reversing,setReversing]=useState<{entry:Entry;version?:number}|null>(null);
 const r=useResource<LedgerList>('trading/ledger/?'+query({...filters,page}));const accounts=useResource<AccountList>('trading/accounts/');const cmd=useCommand();
 return <><Card><Form form={filterForm} layout="inline" className="business-filters" onFinish={values=>{setFilters(values);setPage(1);}}>
 {['date_from','date_to'].map(key=><Form.Item key={key} name={key} label={t(`biz.${key}`)}><Input type="date"/></Form.Item>)}
 <Form.Item name="account" label={t('biz.account')}><Select allowClear style={{width:180}} loading={accounts.loading} options={accounts.data?.results.map(a=>({value:a.id,label:a.name}))}/></Form.Item>
 {['direction','category','source'].map(key=><Form.Item key={key} name={key} label={t(`biz.${key}`)}><Select allowClear style={{width:160}} options={(key==='direction'?['income','expense']:key==='category'?categories:['settlement','manual','correction','refund','reversal','void']).map(value=>({value,label:t(`biz.${value}`)}))}/></Form.Item>)}
 <Form.Item><Button type="primary" htmlType="submit">{t('biz.filter')}</Button></Form.Item><Form.Item><Button onClick={()=>{filterForm.resetFields();setFilters({});setPage(1);}}>{t('biz.reset')}</Button></Form.Item></Form></Card>
 {r.data&&<Metrics data={{periodIncome:r.data.income,periodExpense:r.data.expense,net:r.data.net}} keys={['periodIncome','periodExpense','net']}/>}
 <div className="business-toolbar"><Button type="primary" onClick={()=>setEditor(true)}>{t('biz.manualEntry')}</Button><Space><Select aria-label={t('biz.exportLanguage')} value={exportLanguage||i18n.language} onChange={setExportLanguage} options={[{value:'zh-CN',label:'中文'},{value:'en',label:'English'}]}/><Button loading={exporting} onClick={async()=>{setExporting(true);setError('');try{await downloadLedger({...filters,language:exportLanguage||i18n.language});}catch(e){setError((e as Error).message);}finally{setExporting(false);}}}>{t('biz.export')}</Button></Space></div>
 <ErrorBox error={r.error||accounts.error||error} retry={()=>{r.refresh();accounts.refresh();}}/>
 <Table<Entry> rowKey="id" loading={r.loading} dataSource={r.data?.results} scroll={{x:1450}} pagination={{current:page,pageSize:20,total:r.data?.count,showSizeChanger:false,onChange:setPage}} columns={[
 {title:t('biz.date'),dataIndex:'date'},{title:t('biz.account'),dataIndex:'account_name'},
 ...['direction','category','source','component'].map(key=>({title:t(`biz.${key}`),dataIndex:key,render:(v:string)=>v?t(`biz.${v}`):'—'})),
 {title:t('biz.amount'),dataIndex:'amount',render:(v:string,e:Entry)=><span className={e.direction==='expense'?'negative':''}>{e.direction==='expense'?'−':'+'}{cash(v)}</span>},
 {title:t('biz.number'),dataIndex:'order_number'},{title:t('biz.reason'),dataIndex:'reason'},{title:t('biz.operator'),dataIndex:'actor_name'},
 {title:t('biz.action'),render:(_:unknown,e:Entry)=>e.reversed?<Tag>{t('biz.reversed')}</Tag>:user?.role==='admin'&&e.source==='manual'&&!e.component&&<Button danger onClick={async()=>{setError('');try{const order=e.order?await api<Order>(`trading/orders/${e.order}/`):undefined;setReversing({entry:e,version:order?.version});}catch(err){setError((err as Error).message);}}}>{t('biz.reverseAction')}</Button>},
 ]}/>
 {editor&&<EntryEditor onClose={()=>setEditor(false)} onSaved={()=>{r.refresh();onChanged();}}/>}
 {reversing&&<ReasonDialog title={t('biz.reverseAction')+' · #'+reversing.entry.id} hint={t('biz.reverseHint')+` (${reversing.entry.account_name} · ${cash(reversing.entry.amount)})`} date onClose={()=>setReversing(null)} onSubmit={async values=>{await cmd.send(`trading/ledger/${reversing.entry.id}/reverse/`,{...values,version:reversing.version});r.refresh();onChanged();}}/>}
 </>;
}

export default function Funds(){const {t}=useTranslation();const r=useResource<Dashboard>('trading/dashboard/');return <><div className="page-heading"><div className="eyebrow">CASH MANAGEMENT · USD</div><h1>{t('biz.funds')}</h1><p>{t('biz.manualHint')}</p></div><ErrorBox error={r.error} retry={r.refresh}/>{r.data&&<Metrics data={r.data} keys={['account_count','total_balance','receivable','payable','net_expected']}/>}<Tabs destroyOnHidden items={[{key:'accounts',label:t('biz.accounts'),children:<Accounts onChanged={r.refresh}/>},{key:'ledger',label:t('biz.ledger'),children:<Ledger onChanged={r.refresh}/>}]}/></>;}

