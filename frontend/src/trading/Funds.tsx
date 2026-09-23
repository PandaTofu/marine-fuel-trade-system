import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from "antd";
import { DeleteOutlined, EditOutlined, StarOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { api } from "../api";
import { ErrorBox, Language } from "../components";
import { useLocaleValidation } from "../useLocaleValidation";
import {
  AccountField,
  cash,
  CommandErrors,
  downloadLedger,
  Metrics,
  MoneyInput,
  query,
  ReasonDialog,
  today,
  useCommand,
  useResource,
} from "./shared";
import {
  components,
  type Account,
  type AccountList,
  type Entry,
  type LedgerList,
  type Order,
  type Dashboard,
  type ForecastData,
  type ForecastRow,
} from "./types";

function AccountEditor({
  account,
  onClose,
  onSaved,
}: {
  account?: Account;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  useLocaleValidation(form);
  const cmd = useCommand();
  return (
    <Modal
      open
      title={
        <Space>
          {t(account ? "biz.edit" : "biz.addAccount")}
          <Language />
        </Space>
      }
      footer={null}
      onCancel={() => {
        if (!cmd.busy) onClose();
      }}
    >
      <Alert type="info" message={t("biz.accountHint")} />
      <CommandErrors command={cmd} />
      <Form
        form={form}
        layout="vertical"
        initialValues={
          account || {
            account_type: "bank",
            currency: "USD",
            opening_balance: "0",
            is_active: true,
            note: "",
          }
        }
        onFinish={async (values) => {
          try {
            await cmd.send(
              `trading/accounts/${account ? account.id + "/" : ""}`,
              { ...values, version: account?.version },
              account ? "PATCH" : "POST",
            );
            onSaved();
            onClose();
          } catch {
            /* Keep form. */
          }
        }}
      >
        <Form.Item
          name="name"
          label={t("biz.accountName")}
          rules={[{ required: true, whitespace: true, message: t("required") }]}
        >
          <Input maxLength={120} />
        </Form.Item>
        <div className="business-form-grid">
          <Form.Item
            name="account_type"
            label={t("biz.accountType")}
            rules={[{ required: true, message: t("required") }]}
          >
            <Select
              options={["bank", "cash", "other"].map((value) => ({
                value,
                label: t(`biz.${value}Account`),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="currency"
            label={t("biz.currency")}
            rules={[{ required: true, message: t("required") }]}
          >
            <Select
              disabled={account?.has_entries}
              options={["USD", "CNY", "HKD", "SGD", "EUR"].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
        </div>
        <Form.Item
          name="opening_balance"
          label={t("biz.opening_balance")}
          rules={[{ required: true, message: t("required") }]}
        >
          <MoneyInput disabled={account?.has_entries} />
        </Form.Item>
        <Form.Item name="is_active" valuePropName="checked">
          <Checkbox>{t("active")}</Checkbox>
        </Form.Item>
        <Form.Item name="note" label={t("biz.note")}>
          <Input.TextArea maxLength={1000} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={cmd.busy}>
          {t("biz.save")}
        </Button>
      </Form>
    </Modal>
  );
}

function Accounts({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const r = useResource<AccountList>("trading/accounts/");
  const cmd = useCommand();
  const [editor, setEditor] = useState<Account | "new" | null>(null),
    [deleting, setDeleting] = useState<Account | null>(null);
  return (
    <>
      <ErrorBox error={r.error} retry={r.refresh} />
      <CommandErrors command={cmd} />
      {r.data && (
        <div className="business-metrics">
          {Object.entries(r.data.totals_by_currency).map(
            ([currency, balance]) => (
              <Card key={currency}>
                <span>
                  {t("biz.total_balance")} · {currency}
                </span>
                <strong className={balance.startsWith("-") ? "negative" : ""}>
                  {cash(balance)} {currency}
                </strong>
              </Card>
            ),
          )}
        </div>
      )}
      <Alert type="info" message={t("biz.reconciliationHint")} />
      {r.data?.results.some((a) => a.balance.startsWith("-")) && (
        <Alert type="warning" message={t("biz.negativeBalance")} />
      )}
      <div className="business-toolbar">
        {user?.role === "admin" && (
          <Button type="primary" onClick={() => setEditor("new")}>
            {t("biz.addAccount")}
          </Button>
        )}
      </div>
      <Table<Account>
        rowKey="id"
        loading={r.loading}
        dataSource={r.data?.results}
        scroll={{ x: 1450 }}
        columns={[
          {
            title: t("biz.accountName"),
            dataIndex: "name",
            render: (v: string, a: Account) => (
              <Space>
                {v}
                {a.is_default && <Tag color="green">{t("biz.default")}</Tag>}
                {!a.is_active && <Tag>{t("inactive")}</Tag>}
              </Space>
            ),
          },
          {
            title: t("biz.accountType"),
            dataIndex: "account_type",
            render: (value: string) => t(`biz.${value}Account`),
          },
          { title: t("biz.currency"), dataIndex: "currency" },
          ...[
            "opening_balance",
            "ledger_income",
            "ledger_expense",
            "expected_balance",
            "balance",
            "opening_difference",
          ].map((key) => ({
            title: t(`biz.${key}`),
            dataIndex: key,
            render: (v: string) => (
              <span className={v.startsWith("-") ? "negative" : ""}>
                {cash(v)}
              </span>
            ),
          })),
          {
            title: t("biz.reconciliationStatus"),
            dataIndex: "reconciled",
            render: (v: boolean) => (
              <Tag color={v ? "green" : "red"}>
                {t(v ? "biz.reconciled" : "biz.unreconciled")}
              </Tag>
            ),
          },
          {
            title: t("biz.share"),
            dataIndex: "share",
            render: (v: string | null) => (v === null ? "—" : v + "%"),
          },
          { title: t("biz.note"), dataIndex: "note" },
          {
            title: t("biz.action"),
            render: (_: unknown, a: Account) =>
              user?.role === "admin" && (
                <Space>
                  <Tooltip title={t("biz.edit")}>
                    <Button
                      type="text"
                      aria-label={t("biz.edit")}
                      icon={<EditOutlined />}
                      onClick={() => setEditor(a)}
                    />
                  </Tooltip>
                  <Tooltip title={t("biz.delete")}>
                    <span>
                      <Button
                        type="text"
                        danger
                        aria-label={t("biz.delete")}
                        icon={<DeleteOutlined />}
                        disabled={a.has_entries}
                        onClick={() => setDeleting(a)}
                      />
                    </span>
                  </Tooltip>
                  {!a.is_default && (
                    <Tooltip title={t("biz.setDefault")}>
                      <Button
                        type="text"
                        aria-label={t("biz.setDefault")}
                        icon={<StarOutlined />}
                        onClick={async () => {
                          try {
                            await cmd.send(
                              `trading/accounts/${a.id}/`,
                              { version: a.version, is_default: true },
                              "PATCH",
                            );
                            r.refresh();
                            onChanged();
                          } catch {
                            /* Command error is shown above. */
                          }
                        }}
                      />
                    </Tooltip>
                  )}
                </Space>
              ),
          },
        ]}
      />
      {editor && (
        <AccountEditor
          account={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            r.refresh();
            onChanged();
          }}
        />
      )}
      {deleting && (
        <ReasonDialog
          title={t("biz.delete") + " · " + deleting.name}
          hint={t("biz.accountDeleteHint")}
          onClose={() => setDeleting(null)}
          onSubmit={async (values) => {
            await cmd.send(`trading/accounts/${deleting.id}/`, {
              ...values,
              version: deleting.version,
            });
            r.refresh();
            onChanged();
          }}
        />
      )}
    </>
  );
}

const categories = [
  "customer_receipt",
  "supplier_payment",
  "bank_fee",
  "commission",
  "berth",
  "other_income",
  "other_expense",
];
type Option = { id: number; version: number; label: string };
function EntryEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  useLocaleValidation(form);
  const cmd = useCommand();
  const [search, setSearch] = useState(""),
    [chosen, setChosen] = useState<Option>();
  const orders = useResource<Option[]>(
    "trading/orders/options/?" + query({ q: search }),
  );
  const category = Form.useWatch("category", form);
  const required = [{ required: true, message: t("required") }];
  const needsComponent =
    !!chosen && ["customer_receipt", "supplier_payment"].includes(category);
  return (
    <Modal
      open
      width={720}
      title={
        <Space>
          {t("biz.manualEntry")}
          <Language />
        </Space>
      }
      onCancel={() => {
        if (!cmd.busy) onClose();
      }}
      footer={null}
    >
      <Alert type="info" message={t("biz.manualHint")} />
      <CommandErrors command={cmd} />
      <ErrorBox error={orders.error} />
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          date: today(),
          direction: "income",
          category: "other_income",
          reason: "",
        }}
        onFinish={async (values) => {
          try {
            await cmd.send("trading/ledger/", {
              ...values,
              order_id: chosen?.id || null,
              version: chosen?.version,
              component: needsComponent ? values.component : "",
            });
            onSaved();
            onClose();
          } catch {
            /* Preserve data and request key. */
          }
        }}
      >
        <div className="business-form-grid">
          <Form.Item name="account_id" label={t("biz.account")}>
            <AccountField />
          </Form.Item>
          <Form.Item name="date" label={t("biz.date")} rules={required}>
            <Input type="date" max={today()} />
          </Form.Item>
          <Form.Item name="category" label={t("biz.category")} rules={required}>
            <Select
              options={categories.map((value) => ({
                value,
                label: t(`biz.${value}`),
              }))}
              onChange={(value) => {
                form.setFieldsValue({
                  direction: ["customer_receipt", "other_income"].includes(
                    value,
                  )
                    ? "income"
                    : "expense",
                  component: undefined,
                });
              }}
            />
          </Form.Item>
          <Form.Item
            name="direction"
            label={t("biz.direction")}
            rules={required}
          >
            <Select
              disabled
              options={["income", "expense"].map((value) => ({
                value,
                label: t(`biz.${value}`),
              }))}
            />
          </Form.Item>
          <Form.Item name="amount" label={t("biz.amount")} rules={required}>
            <MoneyInput />
          </Form.Item>
        </div>
        <Form.Item label={t("biz.relatedOrder")}>
          <Select
            allowClear
            showSearch
            filterOption={false}
            loading={orders.loading}
            placeholder={t("biz.unlinked")}
            value={chosen?.id}
            onSearch={setSearch}
            options={[
              ...(orders.data || []),
              ...(chosen && !(orders.data || []).some((o) => o.id === chosen.id)
                ? [chosen]
                : []),
            ].map((o) => ({ value: o.id, label: o.label }))}
            onChange={(id) => {
              setChosen(orders.data?.find((o) => o.id === id));
              form.setFieldValue("component", undefined);
            }}
          />
        </Form.Item>
        {needsComponent && (
          <Form.Item
            name="component"
            label={t("biz.component")}
            rules={required}
          >
            <Select
              options={components
                .filter((c) =>
                  c.startsWith(
                    category === "customer_receipt" ? "customer" : "supplier",
                  ),
                )
                .map((value) => ({ value, label: t(`biz.${value}`) }))}
            />
          </Form.Item>
        )}
        <Form.Item name="reason" label={t("biz.reason")}>
          <Input.TextArea maxLength={1000} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={cmd.busy}>
          {t("biz.save")}
        </Button>
      </Form>
    </Modal>
  );
}

function Ledger({ onChanged }: { onChanged: () => void }) {
  const [filterForm] = Form.useForm();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [filters, setFilters] = useState<Record<string, unknown>>({}),
    [page, setPage] = useState(1),
    [editor, setEditor] = useState(false),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [exportLanguage, setExportLanguage] = useState<string>();
  const [reversing, setReversing] = useState<{
    entry: Entry;
    version?: number;
  } | null>(null);
  const r = useResource<LedgerList>(
    "trading/ledger/?" + query({ ...filters, page }),
  );
  const accounts = useResource<AccountList>("trading/accounts/");
  const cmd = useCommand();
  return (
    <>
      <Card>
        <Form
          form={filterForm}
          layout="inline"
          className="business-filters"
          onFinish={(values) => {
            setFilters(values);
            setPage(1);
          }}
        >
          {["date_from", "date_to"].map((key) => (
            <Form.Item key={key} name={key} label={t(`biz.${key}`)}>
              <Input type="date" />
            </Form.Item>
          ))}
          <Form.Item name="account" label={t("biz.account")}>
            <Select
              allowClear
              style={{ width: 180 }}
              loading={accounts.loading}
              options={accounts.data?.results.map((a) => ({
                value: a.id,
                label: a.name,
              }))}
            />
          </Form.Item>
          {["direction", "category", "source"].map((key) => (
            <Form.Item key={key} name={key} label={t(`biz.${key}`)}>
              <Select
                allowClear
                style={{ width: 160 }}
                options={(key === "direction"
                  ? ["income", "expense"]
                  : key === "category"
                    ? categories
                    : [
                        "settlement",
                        "manual",
                        "correction",
                        "refund",
                        "reversal",
                        "void",
                      ]
                ).map((value) => ({ value, label: t(`biz.${value}`) }))}
              />
            </Form.Item>
          ))}
          <Form.Item>
            <Button type="primary" htmlType="submit">
              {t("biz.filter")}
            </Button>
          </Form.Item>
          <Form.Item>
            <Button
              onClick={() => {
                filterForm.resetFields();
                setFilters({});
                setPage(1);
              }}
            >
              {t("biz.reset")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      {r.data && (
        <Metrics
          data={{
            periodIncome: r.data.income,
            periodExpense: r.data.expense,
            net: r.data.net,
          }}
          keys={["periodIncome", "periodExpense", "net"]}
        />
      )}
      <div className="business-toolbar">
        {["admin", "finance"].includes(user?.role || "") && (
          <Button type="primary" onClick={() => setEditor(true)}>
            {t("biz.manualEntry")}
          </Button>
        )}
        <Space>
          <Select
            aria-label={t("biz.exportLanguage")}
            value={exportLanguage || i18n.language}
            onChange={setExportLanguage}
            options={[
              { value: "zh-CN", label: "中文" },
              { value: "en", label: "English" },
            ]}
          />
          <Button
            loading={exporting}
            onClick={async () => {
              setExporting(true);
              setError("");
              try {
                await downloadLedger({
                  ...filters,
                  language: exportLanguage || i18n.language,
                });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setExporting(false);
              }
            }}
          >
            {t("biz.export")}
          </Button>
        </Space>
      </div>
      <ErrorBox
        error={r.error || accounts.error || error}
        retry={() => {
          r.refresh();
          accounts.refresh();
        }}
      />
      <Table<Entry>
        rowKey="id"
        loading={r.loading}
        dataSource={r.data?.results}
        scroll={{ x: 1450 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: r.data?.count,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          { title: t("biz.date"), dataIndex: "date" },
          { title: t("biz.account"), dataIndex: "account_name" },
          ...["direction", "category", "source", "component"].map((key) => ({
            title: t(`biz.${key}`),
            dataIndex: key,
            render: (v: string) => (v ? t(`biz.${v}`) : "—"),
          })),
          {
            title: t("biz.amount"),
            dataIndex: "amount",
            render: (v: string, e: Entry) => (
              <span className={e.direction === "expense" ? "negative" : ""}>
                {e.direction === "expense" ? "−" : "+"}
                {cash(v)}
              </span>
            ),
          },
          { title: t("biz.number"), dataIndex: "order_number" },
          { title: t("biz.reason"), dataIndex: "reason" },
          { title: t("biz.operator"), dataIndex: "actor_name" },
          {
            title: t("biz.action"),
            render: (_: unknown, e: Entry) =>
              e.reversed ? (
                <Tag>{t("biz.reversed")}</Tag>
              ) : (
                user?.role === "admin" &&
                e.source === "manual" &&
                !e.component && (
                  <Button
                    danger
                    onClick={async () => {
                      setError("");
                      try {
                        const order = e.order
                          ? await api<Order>(`trading/orders/${e.order}/`)
                          : undefined;
                        setReversing({ entry: e, version: order?.version });
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  >
                    {t("biz.reverseAction")}
                  </Button>
                )
              ),
          },
        ]}
      />
      {editor && (
        <EntryEditor
          onClose={() => setEditor(false)}
          onSaved={() => {
            r.refresh();
            onChanged();
          }}
        />
      )}
      {reversing && (
        <ReasonDialog
          title={t("biz.reverseAction") + " · #" + reversing.entry.id}
          hint={
            t("biz.reverseHint") +
            ` (${reversing.entry.account_name} · ${cash(reversing.entry.amount)})`
          }
          date
          onClose={() => setReversing(null)}
          onSubmit={async (values) => {
            await cmd.send(`trading/ledger/${reversing.entry.id}/reverse/`, {
              ...values,
              version: reversing.version,
            });
            r.refresh();
            onChanged();
          }}
        />
      )}
    </>
  );
}

function futureDate(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function Forecast() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<Record<string, unknown>>({
      cutoff: futureDate(30),
    }),
    [selected, setSelected] = useState<string[]>([]),
    [dates, setDates] = useState<Record<string, string>>({});
  const r = useResource<ForecastData>("trading/forecast/?" + query(filters));
  const rows = r.data?.results || [];
  const cutoff = String(filters.cutoff || r.data?.cutoff || "");
  const chosen = rows.filter(
    (row) =>
      selected.includes(row.key) &&
      String(dates[row.key] || row.expected_date) <= cutoff,
  );
  const income = chosen
      .filter((row) => row.side === "customer")
      .reduce((sum, row) => sum + Number(row.amount), 0),
    expense = chosen
      .filter((row) => row.side === "supplier")
      .reduce((sum, row) => sum + Number(row.amount), 0),
    current = Number(r.data?.current_balance || 0),
    projected = current + income - expense;
  const daily = Object.entries(
    chosen.reduce<Record<string, number>>((result, row) => {
      const day = dates[row.key] || row.expected_date;
      result[day] =
        (result[day] || 0) +
        (row.side === "customer" ? 1 : -1) * Number(row.amount);
      return result;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  let running = current;
  const trajectory = daily.map(([day, change]) => ({
    day,
    change,
    balance: (running += change),
  }));
  const chartValues = [current, ...trajectory.map((point) => point.balance)],
    chartMin = Math.min(...chartValues),
    chartMax = Math.max(...chartValues),
    chartSpan = chartMax - chartMin || 1;
  const chartPoints = chartValues
      .map(
        (value, index) =>
          `${20 + index * (560 / Math.max(chartValues.length - 1, 1))},${160 - ((value - chartMin) / chartSpan) * 130}`,
      )
      .join(" "),
    zeroY = Math.max(
      20,
      Math.min(165, 160 - ((0 - chartMin) / chartSpan) * 130),
    );
  const download = () => {
    const header = [
      t("biz.number"),
      t("biz.forecastType"),
      t("biz.counterparty"),
      t("biz.amount"),
      t("biz.dueDate"),
      t("biz.expectedDate"),
    ];
    const body = chosen.map((row) => [
      row.number,
      t(`biz.${row.side}`),
      row.counterparty,
      row.amount,
      row.due_date,
      dates[row.key] || row.expected_date,
    ]);
    const summary = [
      [t("biz.forecastCutoff"), cutoff],
      [t("biz.forecastCurrent"), current.toFixed(2)],
      [t("biz.forecastIncome"), income.toFixed(2)],
      [t("biz.forecastExpense"), expense.toFixed(2)],
      [t("biz.forecastBalance"), projected.toFixed(2)],
      [],
    ];
    const csv =
      "\ufeff" +
      [...summary, header, ...body]
        .map((line) =>
          line
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash_forecast_${cutoff}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <Alert type="info" message={t("biz.forecastHint")} />
      <Card>
        <Form
          form={form}
          layout="inline"
          className="business-filters"
          initialValues={filters}
          onFinish={(values) => {
            setFilters(values);
            setSelected([]);
            setDates({});
          }}
        >
          <Form.Item
            name="cutoff"
            label={t("biz.forecastCutoff")}
            rules={[{ required: true, message: t("required") }]}
          >
            <Input type="date" />
          </Form.Item>
          {["customer", "supplier", "oil"].map((key) => (
            <Form.Item key={key} name={key} label={t(`biz.${key}`)}>
              <Input allowClear />
            </Form.Item>
          ))}
          <Form.Item name="scope" label={t("biz.filter")}>
            <Select
              allowClear
              style={{ width: 140 }}
              options={["overdue", "not_due"].map((value) => ({
                value,
                label: t(`biz.${value}`),
              }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              {t("biz.filter")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Metrics
        data={{
          forecastCurrent: r.data?.current_balance || "0",
          forecastIncome: income.toFixed(2),
          forecastExpense: expense.toFixed(2),
          forecastBalance: projected.toFixed(2),
        }}
        keys={[
          "forecastCurrent",
          "forecastIncome",
          "forecastExpense",
          "forecastBalance",
        ]}
      />
      {projected < 0 && (
        <Alert type="warning" message={t("biz.forecastNegative")} />
      )}
      <div className="business-toolbar">
        <Space>
          <Button onClick={() => setSelected(rows.map((row) => row.key))}>
            {t("biz.selectAll")}
          </Button>
          <Button onClick={() => setSelected([])}>{t("biz.selectNone")}</Button>
        </Space>
        <Button disabled={!chosen.length} onClick={download}>
          {t("biz.exportForecast")}
        </Button>
      </div>
      <ErrorBox error={r.error} retry={r.refresh} />
      <Table<ForecastRow>
        rowKey="key"
        loading={r.loading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1100 }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys.map(String)),
        }}
        columns={[
          { title: t("biz.number"), dataIndex: "number" },
          {
            title: t("biz.forecastType"),
            dataIndex: "side",
            render: (v: string) => (
              <Tag color={v === "customer" ? "green" : "orange"}>
                {t(`biz.${v}`)}
              </Tag>
            ),
          },
          { title: t("biz.counterparty"), dataIndex: "counterparty" },
          { title: t("biz.vessel"), dataIndex: "vessel" },
          { title: t("biz.oil"), dataIndex: "oils" },
          {
            title: t("biz.amount"),
            dataIndex: "amount",
            render: (v: string) => cash(v),
          },
          { title: t("biz.dueDate"), dataIndex: "due_date" },
          {
            title: t("biz.expectedDate"),
            render: (_: unknown, row: ForecastRow) => (
              <Input
                type="date"
                value={dates[row.key] || row.expected_date}
                onChange={(event) =>
                  setDates((current) => ({
                    ...current,
                    [row.key]: event.target.value,
                  }))
                }
              />
            ),
          },
        ]}
      />
      <Card title={t("biz.dailyForecast")}>
        {trajectory.length ? (
          <>
            <svg
              className="forecast-chart"
              viewBox="0 0 600 180"
              role="img"
              aria-label={t("biz.dailyForecast")}
            >
              <line
                x1="20"
                y1={zeroY}
                x2="580"
                y2={zeroY}
                className="forecast-zero"
              />
              <polyline points={chartPoints} className="forecast-line" />
            </svg>
            {trajectory.map((point) => (
              <div className="order-summary-row" key={point.day}>
                <span>{point.day}</span>
                <span>
                  {point.change >= 0 ? "+" : ""}
                  {cash(point.change.toFixed(2))}
                </span>
                <strong className={point.balance < 0 ? "negative" : ""}>
                  {cash(point.balance.toFixed(2))}
                </strong>
              </div>
            ))}
          </>
        ) : (
          <span>{t("biz.noForecastSelection")}</span>
        )}
      </Card>
    </>
  );
}

export default function Funds() {
  const { t } = useTranslation();
  const r = useResource<Dashboard>("trading/dashboard/");
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">CASH MANAGEMENT · USD</div>
        <h1>{t("biz.funds")}</h1>
        <p>{t("biz.manualHint")}</p>
      </div>
      <ErrorBox error={r.error} retry={r.refresh} />
      {r.data && (
        <Metrics
          data={r.data}
          keys={[
            "account_count",
            "total_balance",
            "receivable",
            "payable",
            "net_expected",
          ]}
        />
      )}
      <Tabs
        destroyOnHidden
        items={[
          {
            key: "accounts",
            label: t("biz.accounts"),
            children: <Accounts onChanged={r.refresh} />,
          },
          {
            key: "ledger",
            label: t("biz.ledger"),
            children: <Ledger onChanged={r.refresh} />,
          },
          {
            key: "forecast",
            label: t("biz.cashForecast"),
            children: <Forecast />,
          },
        ]}
      />
    </>
  );
}
