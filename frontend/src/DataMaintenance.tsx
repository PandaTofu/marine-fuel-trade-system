import { useState } from "react";
import { Alert, Button, Card, Form, Input, Modal, Spin, Statistic } from "antd";
import { DeleteOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth";
import { ErrorBox } from "./components";
import { CommandErrors, useCommand, useResource } from "./trading/shared";

type MaintenanceData = {
  order_count: number;
  latest_backup: null | {
    id: number;
    order_count: number;
    reason: string;
    created_at: string;
    actor: string;
  };
};

export default function DataMaintenance() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const resource = useResource<MaintenanceData>("trading/orders/data-maintenance/");
  const command = useCommand();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const confirmation = Form.useWatch("confirmation", form);

  if (user?.role !== "admin") return <Navigate to="/app" replace />;

  const latest = resource.data?.latest_backup;
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">SYSTEM MAINTENANCE</div>
        <h1>{t("dataMaintenance")}</h1>
        <p>{t("dataMaintenanceCopy")}</p>
      </div>
      <ErrorBox error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Spin />
      ) : (
        <Card title={t("testDataCleanup")} className="danger-zone-card">
          <Alert
            showIcon
            type="warning"
            message={t("purgeWarningTitle")}
            description={t("purgeWarning")}
          />
          <div className="maintenance-summary">
            <Statistic title={t("ordersToDelete")} value={resource.data?.order_count ?? 0} />
            <div className="maintenance-backup">
              <SafetyCertificateOutlined />
              <div>
                <strong>{t("automaticBackup")}</strong>
                <p>
                  {latest
                    ? t("latestPurgeBackup", {
                        count: latest.order_count,
                        user: latest.actor,
                        time: new Date(latest.created_at).toLocaleString(),
                      })
                    : t("noPurgeBackup")}
                </p>
              </div>
            </div>
          </div>
          <Button
            danger
            type="primary"
            icon={<DeleteOutlined />}
            disabled={!resource.data?.order_count}
            onClick={() => {
              form.resetFields();
              setOpen(true);
            }}
          >
            {t("purgeAllOrders")}
          </Button>
        </Card>
      )}
      <Modal
        open={open}
        title={t("purgeConfirmTitle")}
        footer={null}
        destroyOnHidden
        closable={!command.busy}
        maskClosable={false}
        onCancel={() => setOpen(false)}
      >
        <Alert
          showIcon
          type="error"
          message={t("purgeIrreversible")}
          description={t("purgeBackupHint")}
        />
        <CommandErrors command={command} />
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            try {
              await command.send("trading/orders/data-maintenance/", values);
              setOpen(false);
              resource.refresh();
            } catch {
              // CommandErrors keeps the form visible with the submitted values.
            }
          }}
        >
          <Form.Item
            name="confirmation"
            label={t("purgeConfirmationLabel")}
            extra={t("purgeConfirmationHint")}
            rules={[{ required: true }, { pattern: /^DELETE ALL ORDERS$/ }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="reason"
            label={t("purgeReason")}
            rules={[{ required: true, whitespace: true, max: 1000 }]}
          >
            <Input.TextArea rows={3} maxLength={1000} showCount />
          </Form.Item>
          <Button
            danger
            type="primary"
            htmlType="submit"
            loading={command.busy}
            disabled={confirmation !== "DELETE ALL ORDERS"}
          >
            {t("confirmPurge")}
          </Button>
        </Form>
      </Modal>
    </>
  );
}
