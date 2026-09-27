import { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Select, Space, Spin } from "antd";
import { SendOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { ErrorBox } from "../components";
import type { DocumentKind } from "./DocumentEditor";

type EmailDefaults = {
  recipients: string[];
  cc: string[];
  subject: string;
  body: string;
  attachment_name: string;
  from_email: string;
  customers: { id: number; name: string; email: string }[];
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailSender({
  orderId,
  kind,
  onClose,
  onSent,
}: {
  orderId: number;
  kind: DocumentKind;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [defaults, setDefaults] = useState<EmailDefaults>();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<EmailDefaults>(`trading/orders/${orderId}/documents/${kind}/email/`)
      .then((result) => {
        setDefaults(result);
        form.setFieldsValue(result);
      })
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoading(false));
  }, [form, kind, orderId]);

  const emailListRule = {
    validator: (_: unknown, values?: string[]) =>
      (values || []).every((value) => emailPattern.test(value))
        ? Promise.resolve()
        : Promise.reject(new Error(t("biz.invalidEmailAddress"))),
  };
  const options = (defaults?.customers || []).map((customer) => ({
    value: customer.email,
    label: `${customer.name} · ${customer.email}`,
  }));

  return (
    <Modal
      open
      width={760}
      title={t(kind === "invoice" ? "biz.sendInvoice" : "biz.sendContract")}
      onCancel={onClose}
      footer={null}
      maskClosable={false}
      destroyOnHidden
    >
      <ErrorBox error={error} />
      {loading ? (
        <Spin />
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setSending(true);
            setError("");
            try {
              await api(
                `trading/orders/${orderId}/documents/${kind}/email/`,
                "POST",
                { ...values, request_id: crypto.randomUUID() },
              );
              onSent();
              onClose();
            } catch (reason) {
              setError((reason as Error).message);
            } finally {
              setSending(false);
            }
          }}
        >
          <div className="email-readonly-row">
            <span>{t("biz.fromEmail")}</span>
            <strong>{defaults?.from_email || "—"}</strong>
          </div>
          <Form.Item
            name="recipients"
            label={t("biz.recipients")}
            rules={[{ required: true, message: t("biz.recipientRequired") }, emailListRule]}
          >
            <Select
              mode="tags"
              tokenSeparators={[",", ";", " "]}
              options={options}
              placeholder={t("biz.recipientPlaceholder")}
            />
          </Form.Item>
          <Form.Item name="cc" label={t("biz.cc")} rules={[emailListRule]}>
            <Select
              mode="tags"
              tokenSeparators={[",", ";", " "]}
              options={options}
              placeholder={t("biz.ccPlaceholder")}
            />
          </Form.Item>
          <Form.Item name="subject" label={t("biz.emailSubject")} rules={[{ required: true }]}>
            <Input maxLength={300} />
          </Form.Item>
          <Form.Item name="body" label={t("biz.emailBody")} rules={[{ required: true }]}>
            <Input.TextArea rows={13} maxLength={20000} />
          </Form.Item>
          <div className="email-readonly-row">
            <span>{t("biz.attachment")}</span>
            <strong>{defaults?.attachment_name}</strong>
          </div>
          <p className="muted">{t("biz.emailAttachmentHint")}</p>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending}>
              {t("biz.sendEmail")}
            </Button>
            <Button onClick={onClose} disabled={sending}>{t("cancel")}</Button>
          </Space>
        </Form>
      )}
    </Modal>
  );
}
