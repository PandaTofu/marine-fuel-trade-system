import { useState } from "react";
import { Alert, App, Button, Card, Form, Input, Modal, Select, Spin, Statistic, Table, Upload } from "antd";
import { DeleteOutlined, ImportOutlined, SafetyCertificateOutlined, UploadOutlined } from "@ant-design/icons";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth";
import { uploadApi } from "./api";
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

type ImportType = "orders" | "customer" | "supplier" | "oil";

type ImportResult = {
  summary: {
    total: number;
    ready: number;
    duplicate: number;
    invalid: number;
    line_count?: number;
    orphan_lines?: number;
  };
  rows: Array<{
    number?: string;
    name?: string;
    source_code?: string;
    result: "ready" | "duplicate" | "invalid";
    errors: string[];
    line_count?: number;
  }>;
  created?: number;
};

export default function DataMaintenance() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { user } = useAuth();
  const resource = useResource<MaintenanceData>("trading/orders/data-maintenance/");
  const command = useCommand();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState<ImportType>("orders");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [form] = Form.useForm();
  const confirmation = Form.useWatch("confirmation", form);

  if (user?.role !== "admin") return <Navigate to="/app" replace />;

  const latest = resource.data?.latest_backup;
  const isOrderImport = importType === "orders";
  const importEndpoint = isOrderImport ? "trading/orders/import/" : "reference/import-data/";
  const resetImportFile = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportError("");
  };
  const inspectImport = async (file: File) => {
    setImportFile(file);
    setImportPreview(null);
    setImportError("");
    setImportBusy(true);
    try {
      const data = new FormData();
      data.append("file", file);
      if (!isOrderImport) data.append("kind", importType);
      setImportPreview(await uploadApi<ImportResult>(importEndpoint, data));
    } catch (error) {
      setImportError((error as Error).message);
    } finally {
      setImportBusy(false);
    }
  };
  const confirmImport = async () => {
    if (!importFile || !importPreview?.summary.ready) return;
    setImportBusy(true);
    setImportError("");
    try {
      const data = new FormData();
      data.append("file", importFile);
      data.append("confirm", "true");
      if (!isOrderImport) data.append("kind", importType);
      const result = await uploadApi<ImportResult>(importEndpoint, data);
      message.success(t("biz.dataImportCreated", { count: result.created || 0 }));
      setImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      resource.refresh();
    } catch (error) {
      setImportError((error as Error).message);
    } finally {
      setImportBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">SYSTEM MAINTENANCE</div>
        <h1>{t("dataMaintenance")}</h1>
        <p>{t("dataMaintenanceCopy")}</p>
      </div>
      <ErrorBox error={resource.error} retry={resource.refresh} />
      <Card title={t("biz.dataImport")} className="data-import-card">
        <div className="data-import-entry">
          <div className="data-import-icon"><ImportOutlined /></div>
          <div className="data-import-copy">
            <strong>{t("biz.importData")}</strong>
            <p>{t("biz.dataImportHint")}</p>
          </div>
          <Select
            value={importType}
            aria-label={t("biz.importDataType")}
            onChange={(value: ImportType) => {
              setImportType(value);
              resetImportFile();
            }}
            options={(["orders", "customer", "supplier", "oil"] as ImportType[]).map((value) => ({
              value,
              label: t(`biz.importType_${value}`),
            }))}
          />
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
            {t("biz.startImport")}
          </Button>
        </div>
        <Alert type="info" showIcon message={t("biz.supportedImportTypes")} />
      </Card>
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
        open={importOpen}
        width={760}
        title={t(`biz.importTitle_${importType}`)}
        okText={t("biz.confirmImport")}
        cancelText={t("biz.cancel")}
        confirmLoading={importBusy}
        maskClosable={false}
        okButtonProps={{ disabled: !importPreview?.summary.ready }}
        onOk={confirmImport}
        onCancel={() => {
          if (importBusy) return;
          setImportOpen(false);
          resetImportFile();
        }}
      >
        <Alert type="info" showIcon message={t(`biz.importHint_${importType}`)} />
        <Upload
          accept={isOrderImport ? ".xlsx" : ".txt,.csv"}
          maxCount={1}
          showUploadList
          beforeUpload={(file) => {
            void inspectImport(file);
            return false;
          }}
          onRemove={() => {
            resetImportFile();
          }}
        >
          <Button loading={importBusy} icon={<UploadOutlined />} style={{ marginTop: 16 }}>
            {t("biz.selectImportFile")}
          </Button>
        </Upload>
        <ErrorBox error={importError} />
        {importPreview && (
          <>
            <Alert
              style={{ margin: "16px 0" }}
              type={importPreview.summary.invalid ? "warning" : "success"}
              message={t(isOrderImport ? "biz.orderImportSummary" : "biz.referenceImportSummary", importPreview.summary)}
              description={importPreview.summary.orphan_lines ? t("biz.orderImportOrphans", { count: importPreview.summary.orphan_lines }) : undefined}
            />
            <Table
              size="small"
              rowKey={(row) => `${row.number || row.source_code || row.name}-${row.result}`}
              pagination={{ pageSize: 8 }}
              dataSource={importPreview.rows}
              columns={[
                ...(isOrderImport
                  ? [
                      { title: t("biz.number"), dataIndex: "number" },
                      { title: t("biz.productDetails"), dataIndex: "line_count", width: 100 },
                    ]
                  : [
                      { title: t("biz.sourceCode"), dataIndex: "source_code", width: 150 },
                      { title: t("biz.name"), dataIndex: "name" },
                    ]),
                { title: t("biz.importResult"), dataIndex: "result", width: 120, render: (value: string) => t(`biz.import_${value}`) },
                { title: t("biz.importIssues"), dataIndex: "errors", render: (values: string[]) => values.length ? values.map((value) => t(`biz.${value}`)).join("；") : "—" },
              ]}
            />
          </>
        )}
      </Modal>
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
