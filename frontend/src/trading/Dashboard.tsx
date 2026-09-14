import {Card,Table,Button} from 'antd';
import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {ErrorBox} from '../components';
import {cash,Metrics,Status,useResource} from './shared';
import type {Dashboard as DashboardData,Order} from './types';
export default function Dashboard(){
 const {t}=useTranslation();const r=useResource<DashboardData>('trading/dashboard/');
 return <><div className="page-heading"><div className="eyebrow">OPERATIONS OVERVIEW</div><h1>{t('overview')}</h1><p>{t('biz.overviewCopy')}</p></div><ErrorBox error={r.error} retry={r.refresh}/>
 {r.data&&<><Metrics data={r.data} keys={['order_count','pending_count','sales','cost','commission','profit','month_order_count','month_profit','receivable','payable','total_balance','net_expected']}/>
 <Card title={t('biz.overdueTitle')} extra={<Link to="/app/settlements"><Button>{t('biz.settlements')}</Button></Link>}>
 <Table<Order> rowKey="id" dataSource={r.data.overdue} scroll={{x:900}} locale={{emptyText:t('biz.noOverdue')}} columns={[
 {title:t('biz.number'),dataIndex:'number'},{title:t('biz.customer'),dataIndex:'customer'},{title:t('biz.vessel'),dataIndex:'vessel'},
 ...['receivable','payable'].map(key=>({title:t(`biz.${key}`),render:(_:unknown,o:Order)=>cash(o.numbers[key as 'receivable'|'payable'])})),
 ...['customer_due','supplier_due'].map(key=>({title:t(`biz.${key}`),render:(_:unknown,o:Order)=>o.numbers[key as 'customer_due'|'supplier_due']||'—'})),
 ...['customer_status','supplier_status'].map(key=>({title:t(`biz.${key}`),render:(_:unknown,o:Order)=><Status value={o.numbers[key as 'customer_status'|'supplier_status']}/> })),
 ]}/></Card></>}
 </>;
}
