import {useState} from 'react';
import type {ReactNode} from 'react';
import {Alert,Button,DatePicker,Form,Input,InputNumber,Modal,Select,Space,Table,Tabs,Tooltip} from 'antd';
import {DeleteOutlined,FilePdfOutlined,PlusOutlined} from '@ant-design/icons';
import dayjs from 'dayjs';
import {useTranslation} from 'react-i18next';
import {ErrorBox,Language} from '../components';
import {useLocaleValidation} from '../useLocaleValidation';
import {AccountField,cash,CommandErrors,MoneyInput,ReferenceInput,Status,today,useCommand,useResource} from './shared';
import {components,type Order,type Revision,type LedgerList} from './types';

export function OrderEditor({order,onClose,onSaved}:{order?:Order;onClose:()=>void;onSaved:()=>void}){
 const {t}=useTranslation();const [form]=Form.useForm();useLocaleValidation(form);const cmd=useCommand();
 const required=[{required:true,message:t('required')}];
 const input=(key:string,requiredField=false)=><Form.Item key={key} name={key} label={t(`biz.${key}`)} rules={requiredField?required:[]}>{['customer','supplier','port','salesperson'].includes(key)?<ReferenceInput kind={key}/>:<Input maxLength={key==='imo'?40:160}/>}</Form.Item>;
 const values=Form.useWatch([],form)||{};
 const scaled=(value:unknown,scale:number)=>{const match=String(value??'0').match(/^(\d*)(?:\.(\d*))?$/);if(!match)return 0n;return BigInt((match[1]||'0')+(match[2]||'').padEnd(scale,'0').slice(0,scale));};
 const multiplyToCents=(left:unknown,leftScale:number,right:unknown,rightScale:number)=>{const product=scaled(left,leftScale)*scaled(right,rightScale);const divisor=10n**BigInt(leftScale+rightScale-2);return (product+divisor/2n)/divisor;};
 const cents=(value:unknown)=>scaled(value,2);
 const moneyText=(value:bigint)=>`${value<0n?'-':''}${(value<0n?-value:value)/100n}.${String((value<0n?-value:value)%100n).padStart(2,'0')}`;
 const quantityText=(value:bigint)=>`${value/1000n}.${String(value%1000n).padStart(3,'0')}`;
 const compactText=(value:string)=>{const number=Number(value);if(!Number.isFinite(number)||Math.abs(number)<1000)return value;const [suffix,divisor]=Math.abs(number)>=1e9?['B',1e9]:Math.abs(number)>=1e6?['M',1e6]:['K',1e3];const fixed=(number/divisor).toFixed(Math.abs(number/divisor)>=100?0:Math.abs(number/divisor)>=10?1:2);return `${fixed.includes('.')?fixed.replace(/0+$/,'').replace(/\.$/,''):fixed}${suffix}`;};
 const calculated=(value:bigint,danger=false)=><Tooltip title={cash(moneyText(value))}><span className={`calculated-value${danger?' danger':''}`}>$ {compactText(moneyText(value))}</span></Tooltip>;
 const productLabel=(label:string,unit?:string)=><span className="product-field-label"><span>{label}</span><small>{unit||'\u00a0'}</small></span>;
 const num=(value:unknown)=>{const parsed=Number(value||0);return Number.isFinite(parsed)?parsed:0;};
 const lines=(values.lines||[]) as Array<Record<string,unknown>>;
 const lineAmounts=lines.map(line=>({sale:multiplyToCents(line.actual_qty,3,line.sale_price,4),cost:multiplyToCents(line.actual_qty,3,line.cost_price,4)}));
 const totals=lineAmounts.reduce((result,line,index)=>({ordered:result.ordered+scaled(lines[index]?.ordered_qty,3),actual:result.actual+scaled(lines[index]?.actual_qty,3),sale:result.sale+line.sale,cost:result.cost+line.cost}),{ordered:0n,actual:0n,sale:0n,cost:0n});
 const commission=multiplyToCents(quantityText(totals.actual),3,values.commission_rate,4);
 const payable=totals.cost-cents(values.supplier_deposit)-cents(values.supplier_paid);
 const receivable=totals.sale-cents(values.customer_deposit)-cents(values.customer_received)-cents(values.customer_fee);
 const otherFees=cents(values.customer_fee)+cents(values.supplier_fee)+cents(values.berth_fee)+cents(values.exceptional_fee);
 const actualProfit=totals.sale-totals.cost-commission-otherFees;
 const due=(days:unknown)=>{if(!values.actual_date)return '—';const date=new Date(`${values.actual_date}T00:00:00`);date.setDate(date.getDate()+num(days));return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
 const section=(title:string,content:ReactNode)=><section className="order-section"><h3>{title}</h3>{content}</section>;
 const initialValues=order?{...order,...order.numbers,estimated_range:order.estimated_start_date&&order.estimated_end_date?[dayjs(order.estimated_start_date),dayjs(order.estimated_end_date)]:undefined}:{order_date:today(),customer_term_description:'',supplier_term_description:'',customer_term:0,supplier_term:0,commission_rate:'0',customer_fee:'0',supplier_fee:'0',berth_fee:'0',exceptional_fee:'0',customer_deposit:'0',customer_received:'0',supplier_deposit:'0',supplier_paid:'0',lines:[{oil:'',ordered_qty:'0',actual_qty:null,sale_price:'0',cost_price:'0'}]};
 return <Modal open width={1280} title={<div className="order-modal-title"><Space>{t(order?'biz.editOrder':'biz.createOrder')}<Language/></Space><Tooltip title={t('biz.contractComingSoon')}><Button icon={<FilePdfOutlined/>} disabled>{t('biz.exportContract')}</Button></Tooltip></div>} onCancel={()=>{if(!cmd.busy)onClose();}} footer={null}>
 <Alert type="info" message={t('biz.freeInput')} description={t('biz.pendingHint')}/><CommandErrors command={cmd}/>
 <Form form={form} layout="vertical" initialValues={initialValues} onFinish={async values=>{
  const {estimated_range,...fields}=values;const payload={...fields,currency:'USD',estimated_start_date:estimated_range?.[0]?.format('YYYY-MM-DD')||null,estimated_end_date:estimated_range?.[1]?.format('YYYY-MM-DD')||null,actual_date:values.actual_date||null,version:order?.version,
   lines:values.lines.map((line:Record<string,unknown>)=>({oil:line.oil,ordered_qty:line.ordered_qty,actual_qty:line.actual_qty===''||line.actual_qty===undefined?null:line.actual_qty,sale_price:line.sale_price,cost_price:line.cost_price}))};
  try{await cmd.send(`trading/orders/${order?order.id+'/':''}`,payload,order?'PATCH':'POST');onSaved();onClose();}catch{/* ErrorBox preserves form for correction. */}
 }}><div className="order-editor-layout"><div className="order-editor-main">
 {section(t('biz.basicInformation'),<div className="basic-information-layout">
  <div className="business-form-grid adaptive basic-information-row"><Form.Item name="order_date" label={t('biz.order_date')} rules={required}><Input type="date"/></Form.Item>{input('customer',true)}{input('supplier',true)}</div>
  <div className="business-form-grid adaptive basic-information-row">{input('vessel',true)}{input('port',true)}{input('imo')}</div>
 </div>)}
 {section(t('biz.productDetails'),<>
 <Form.List name="lines" rules={[{validator:(_,rows)=>rows?.length?Promise.resolve():Promise.reject(new Error(t('required')))}]}>{(fields,{add,remove},meta)=><>
 <div className="order-lines">{fields.map((field,index)=><div className="order-line" key={field.key}>
 <Form.Item name={[field.name,'oil']} label={productLabel(t('biz.oilName'))} rules={required}><ReferenceInput kind="oil"/></Form.Item>
 <Form.Item name={[field.name,'ordered_qty']} label={productLabel(t('biz.orderQuantity'),'MT')} rules={required}><MoneyInput compact precision={3}/></Form.Item>
 <Form.Item name={[field.name,'actual_qty']} label={productLabel(t('biz.actualQuantity'),'MT')}><MoneyInput compact precision={3}/></Form.Item>
 <Form.Item name={[field.name,'sale_price']} label={productLabel(t('biz.saleUnitPrice'),'USD/MT')} rules={required}><MoneyInput compact precision={4}/></Form.Item>
 <Form.Item label={productLabel(t('biz.saleAmount'),'USD')}>{calculated(lineAmounts[index]?.sale||0n)}</Form.Item>
 <Form.Item name={[field.name,'cost_price']} label={productLabel(t('biz.supplierCostPrice'),'USD/MT')} rules={required}><MoneyInput compact precision={4}/></Form.Item>
 <Form.Item label={productLabel(t('biz.supplierCostAmount'),'USD')}>{calculated(lineAmounts[index]?.cost||0n,true)}</Form.Item>
 <Tooltip title={t('biz.removeLine')}><Button className="order-line-delete" type="text" danger aria-label={t('biz.removeLine')} icon={<DeleteOutlined/>} disabled={fields.length===1} onClick={()=>remove(field.name)}/></Tooltip>
 </div>)}<div className="order-total-row"><strong>{t('biz.total')}</strong><Tooltip title={`${quantityText(totals.ordered)} MT`}><span>{compactText(quantityText(totals.ordered))} MT</span></Tooltip><Tooltip title={`${quantityText(totals.actual)} MT`}><span>{compactText(quantityText(totals.actual))} MT</span></Tooltip><span/>{calculated(totals.sale)}<span/>{calculated(totals.cost,true)}<span/></div></div><Form.ErrorList errors={meta.errors}/><Button icon={<PlusOutlined/>} disabled={fields.length>=100} onClick={()=>add({oil:'',ordered_qty:'0',actual_qty:null,sale_price:'0',cost_price:'0'})}>{t('biz.addLine')}</Button>
 </>}</Form.List>
 </>)}
 {section(t('biz.supplyInformation'),<div className="business-form-grid adaptive"><Form.Item name="estimated_range" label={t('biz.estimatedSupplyRange')}><DatePicker.RangePicker className="supply-range-picker" format="YYYY-MM-DD" placeholder={[t('biz.estimatedSupplyStart'),t('biz.estimatedSupplyEnd')]}/></Form.Item><Form.Item name="actual_date" label={t('biz.actualSupplyDate')}><Input type="date" max={today()}/></Form.Item></div>)}
 <div className="order-two-columns">
 {section(t('biz.supplierPayment'),<div className="business-form-grid compact">{input('supplier_term_description')}<Form.Item name="supplier_term" label={t('biz.paymentDays')} rules={required}><InputNumber min={0} max={32767} precision={0}/></Form.Item><Form.Item name="supplier_deposit" label={t('biz.prepaidDeposit')} rules={required}><MoneyInput compact/></Form.Item><Form.Item name="supplier_paid" label={t('biz.actualPaid')} rules={required}><MoneyInput compact/></Form.Item></div>)}
 {section(t('biz.customerReceipt'),<div className="business-form-grid compact">{input('customer_term_description')}<Form.Item name="customer_term" label={t('biz.paymentDays')} rules={required}><InputNumber min={0} max={32767} precision={0}/></Form.Item><Form.Item name="customer_deposit" label={t('biz.receivedDeposit')} rules={required}><MoneyInput compact/></Form.Item><Form.Item name="customer_received" label={t('biz.actualReceived')} rules={required}><MoneyInput compact/></Form.Item></div>)}
 </div>
 {section(t('biz.otherFees'),<div className="business-form-grid adaptive">{['customer_fee','supplier_fee','berth_fee','exceptional_fee'].map(key=><Form.Item key={key} name={key} label={t(`biz.${key}`)} rules={required}><MoneyInput/></Form.Item>)}</div>)}
 {section(t('biz.performanceCommission'),<div className="business-form-grid commission-fields">{input('salesperson')}{input('commission_recipient')}<Form.Item name="commission_rate" label={t('biz.customerCommissionRate')} rules={required}><MoneyInput compact precision={4}/></Form.Item></div>)}
 {section(t('biz.note'),<Form.Item name="note" noStyle><Input.TextArea rows={4} maxLength={2000}/></Form.Item>)}
 {order&&<Form.Item name="reason" label={t('biz.reason')} extra={t('biz.orderEditHint')}><Input.TextArea maxLength={1000}/></Form.Item>}
 </div><aside className="order-summary-card"><div className="order-summary-title"><span>{t('biz.orderSummary')}</span><small>USD</small></div><div className="order-summary-profit"><span>{t('biz.actualProfit')}</span><strong className={actualProfit<0n?'negative':'positive'}>{cash(moneyText(actualProfit))}</strong><small>{t('biz.actualProfitFormula')}</small></div>
 <div className="order-summary-group"><h4>{t('biz.revenueAndCost')}</h4>{[[t('biz.sales'),totals.sale,''],[t('biz.cost'),totals.cost,'danger'],[t('biz.commissionTotal'),commission,''],[t('biz.otherFees'),otherFees,'']].map(([label,value,tone])=><div className="order-summary-row" key={String(label)}><span>{String(label)}</span><strong className={String(tone)}>{cash(moneyText(value as bigint))}</strong></div>)}</div>
 <div className="order-summary-group"><h4>{t('biz.settlementBalance')}</h4>{[[t('biz.remainingReceivable'),receivable],[t('biz.remainingPayable'),payable]].map(([label,value])=><div className="order-summary-row" key={String(label)}><span>{String(label)}</span><Tooltip title={cash(moneyText(value as bigint))}><strong className="danger">$ {compactText(moneyText(value as bigint))}</strong></Tooltip></div>)}</div>
 <div className="order-summary-group"><h4>{t('biz.keyDates')}</h4><div className="order-summary-row"><span>{t('biz.receiptDueDate')}</span><strong className="date">{due(values.customer_term)}</strong></div><div className="order-summary-row"><span>{t('biz.paymentDueDate')}</span><strong className="date">{due(values.supplier_term)}</strong></div></div>
 </aside></div>
 <Space><Button type="primary" htmlType="submit" loading={cmd.busy}>{t('biz.save')}</Button><span>{t('biz.saveThenPay')}</span></Space>
 </Form></Modal>;
}

export function SettlementEditor({order,refund=false,onClose,onSaved}:{order:Order;refund?:boolean;onClose:()=>void;onSaved:()=>void}){
 const {t}=useTranslation();const [form]=Form.useForm();useLocaleValidation(form);const cmd=useCommand();const required=[{required:true,message:t('required')}];
 return <Modal open width={760} title={<Space>{t(refund?'biz.refundAction':'biz.recordPayment')} · {order.number}<Language/></Space>} onCancel={()=>{if(!cmd.busy)onClose();}} footer={null}>
 <Alert type="info" message={t(refund?'biz.refundHint':'biz.settlementHint')}/><CommandErrors command={cmd}/>
 <Form form={form} layout="vertical" initialValues={{...order.numbers,customer_fee:order.customer_fee,supplier_fee:order.supplier_fee,berth_fee:order.berth_fee,exceptional_fee:order.exceptional_fee,date:today()}} onFinish={async values=>{try{await cmd.send(`trading/orders/${order.id}/${refund?'refund':'settlement'}/`,{...values,version:order.version});onSaved();onClose();}catch{/* Retain inputs. */}}}>
 <div className="business-form-grid">
 {refund?<><Form.Item name="component" label={t('biz.component')} rules={required}><Select options={components.map(value=>({value,label:t(`biz.${value}`)}))}/></Form.Item><Form.Item name="amount" label={t('biz.amount')} rules={required}><MoneyInput/></Form.Item></>:<>
 {components.map(key=><Form.Item key={key} name={key} label={t(`biz.${key}`)} rules={required}><MoneyInput/></Form.Item>)}
 {['customer_fee','supplier_fee','berth_fee','exceptional_fee'].map(key=><Form.Item key={key} name={key} label={t(`biz.${key}`)} rules={required}><MoneyInput/></Form.Item>)}
 <Form.Item name="account_id" label={t('biz.account')}><AccountField/></Form.Item></>}
 <Form.Item name="date" label={t('biz.date')} rules={required}><Input type="date" max={today()}/></Form.Item>
 </div><Form.Item name="reason" label={t('biz.reason')} rules={refund?required:[]}><Input.TextArea maxLength={1000}/></Form.Item>
 <Button type="primary" htmlType="submit" loading={cmd.busy}>{t('biz.save')}</Button></Form></Modal>;
}

export function OrderDetail({order,onClose}:{order:Order;onClose:()=>void}){
 const {t}=useTranslation();const revisions=useResource<Revision[]>(`trading/orders/${order.id}/history/`);const ledger=useResource<LedgerList>(`trading/ledger/?order=${order.id}&page_size=200`);const [snapshot,setSnapshot]=useState<Order>(order);
 return <Modal open width={1100} title={<Space>{order.number}<Language/></Space>} onCancel={onClose} footer={null}>
 <Tabs items={[
 {key:'detail',label:t('biz.detail'),children:<>
 <div className="business-detail">{['order_date','customer','supplier','vessel','port','imo','estimated_start_date','estimated_end_date','actual_date','customer_term_description','customer_term','supplier_term_description','supplier_term','commission_rate','commission_recipient','salesperson','customer_fee','supplier_fee','berth_fee','exceptional_fee','note'].map(key=><div key={key}><span>{t(`biz.${key}`)}</span><strong>{String((snapshot as unknown as Record<string,unknown>)[key]??'—')}</strong></div>)}</div>
 <Table rowKey={(_,index)=>String(index)} pagination={false} scroll={{x:700}} dataSource={snapshot.lines} columns={['oil','ordered_qty','actual_qty','sale_price','cost_price','sale_amount','cost_amount'].map(key=>({title:t(`biz.${key}`),dataIndex:key}))}/>
 <div className="business-detail">{Object.entries(snapshot.numbers).map(([key,value])=><div key={key}><span>{t(`biz.${key}`)}</span><strong>{key.endsWith('_status')?<Status value={String(value)}/>:value??'—'}</strong></div>)}</div>
 </>},
 {key:'ledger',label:t('biz.ledger'),children:<><ErrorBox error={ledger.error} retry={ledger.refresh}/><Table rowKey="id" loading={ledger.loading} dataSource={ledger.data?.results} scroll={{x:750}} columns={['date','account_name','direction','category','amount','source','reason'].map(key=>({title:t(`biz.${key==='account_name'?'account':key}`),dataIndex:key,render:(v:string)=>['direction','category','source'].includes(key)?t(`biz.${v}`):key==='amount'?cash(v):v}))}/>{(ledger.data?.count||0)>200&&<p>{t('biz.historyLimit')}</p>}</>},
 {key:'history',label:t('biz.history'),children:<><ErrorBox error={revisions.error} retry={revisions.refresh}/><Table rowKey="version" loading={revisions.loading} dataSource={revisions.data} columns={[
 {title:t('biz.revision'),dataIndex:'version'},{title:t('biz.operator'),dataIndex:'actor'},{title:t('biz.date'),dataIndex:'created_at'},
 {title:t('biz.action'),dataIndex:'action',render:(v:string)=>t(`biz.${v}`)},{title:t('biz.reason'),dataIndex:'reason'},
 {title:t('biz.snapshot'),render:(_:unknown,r:Revision)=><Button onClick={()=>setSnapshot(r.snapshot)}>{t('biz.view')} v{r.version}</Button>},
 ]}/><p>{t('biz.snapshotHint',{version:snapshot.version})}</p></>},
 ]}/></Modal>;
}
