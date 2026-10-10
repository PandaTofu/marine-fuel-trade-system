import { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Space, Spin } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { ErrorBox, Language } from "../components";
import { downloadOrderDocument } from "./shared";

export type DocumentKind = "purchase_contract" | "sales_contract" | "invoice";
export type DocumentResponse = {
  content: Record<string, unknown>;
  updated_at: string | null;
  updated_by: string | null;
  last_sent_at: string | null;
  last_sent_to: string[];
};

export function DocumentEditor({
  orderId,
  kind,
  onClose,
  onSaved,
}: {
  orderId: number;
  kind: DocumentKind;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<DocumentResponse>();

  useEffect(() => {
    api<DocumentResponse>(`trading/orders/${orderId}/documents/${kind}/`)
      .then((result) => {
        setMetadata(result);
        form.setFieldsValue(result.content);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [form, kind, orderId]);

  const save = async (download: boolean) => {
    const content = await form.validateFields();
    setSaving(true);
    setError("");
    try {
      await api(`trading/orders/${orderId}/documents/${kind}/`, "PUT", {
        content,
      });
      onSaved?.();
      if (download) await downloadOrderDocument(orderId, kind);
      else onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const text = (name: string, rows?: number) => (
    <Form.Item name={name} label={t(`biz.${name}`)}>
      {rows ? <Input.TextArea rows={rows} /> : <Input />}
    </Form.Item>
  );
  const contractFields = [
    "reference",
    "date",
    "document_title",
    "vessel",
    "imo",
    "port",
    "eta",
    "buyer",
    "seller",
  ];
  const invoiceFields = [
    "reference_number",
    "invoice_number",
    "customer",
    "customer_address",
    "vessel",
    "imo",
    "port",
    "invoice_date",
    "delivery_date",
    "due_date",
    "customer_reference",
  ];
  const bankFields = [
    "currency",
    "beneficiary_name",
    "beneficiary_address",
    "bank_name",
    "account_number",
    "swift",
    "bank_address",
    "remittance_reference",
  ];

  return (
    <Modal
      open
      width={960}
      title={
        <Space>
          {t(
            kind === "invoice"
              ? "biz.issueInvoice"
              : kind === "purchase_contract"
                ? "biz.purchaseContract"
                : "biz.salesContract",
          )}
          <Language />
        </Space>
      }
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <ErrorBox error={error} />
      {loading ? (
        <Spin />
      ) : (
        <Form form={form} layout="vertical">
          {metadata?.updated_at && (
            <p className="muted">
              {t("biz.lastDocumentEdit", {
                user: metadata.updated_by,
                time: metadata.updated_at,
              })}
            </p>
          )}
          <div className="business-form-grid adaptive">
            {(kind !== "invoice" ? contractFields : invoiceFields).map(
              (field) => text(field),
            )}
          </div>
          {kind === "purchase_contract" && text("physical_supplier")}
          {kind !== "invoice" && text("intro", 2)}
          <Form.List name="products">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <div className="business-form-grid adaptive" key={key}>
                    <Form.Item name={[name, "name"]} label={t("biz.oil")}>
                      <Input />
                    </Form.Item>
                    {kind !== "invoice" && (
                      <Form.Item
                        name={[name, "specification"]}
                        label={t("biz.specification")}
                      >
                        <Input />
                      </Form.Item>
                    )}
                    <Form.Item
                      name={[name, "quantity"]}
                      label={t("biz.quantity")}
                    >
                      <Input />
                    </Form.Item>
                    {kind === "invoice" && (
                      <Form.Item name={[name, "unit"]} label={t("biz.unit")}>
                        <Input />
                      </Form.Item>
                    )}
                    <Form.Item
                      name={[name, "unit_price"]}
                      label={t("biz.sale_price")}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[name, "amount"]}
                      label={t("biz.sale_amount")}
                    >
                      <Input />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<MinusCircleOutlined />}
                      onClick={() => remove(name)}
                    />
                  </div>
                ))}
                <Button icon={<PlusOutlined />} onClick={() => add()}>
                  {t("biz.addLine")}
                </Button>
              </>
            )}
          </Form.List>
          {kind !== "invoice" ? (
            <>
              {text("additional_cost", 3)}
              {text("payment", 2)}
              {text("remarks", 3)}
              {text("terms", 7)}
              {text("closing", 4)}
            </>
          ) : (
            <>
              <div className="business-form-grid adaptive">
                {text("payment_instructions")}
                {text("vat_rate")}
                {bankFields.map((field) => text(field))}
              </div>
              {text("late_payment_terms", 2)}
              {text("bank_charge_terms", 2)}
              {text("fraud_prevention", 2)}
            </>
          )}
          <Space className="spaced">
            <Button
              type="primary"
              loading={saving}
              onClick={() => void save(false)}
            >
              {t("save")}
            </Button>
            <Button loading={saving} onClick={() => void save(true)}>
              {t("biz.saveAndDownload")}
            </Button>
            <Button onClick={onClose}>{t("cancel")}</Button>
          </Space>
        </Form>
      )}
    </Modal>
  );
}
