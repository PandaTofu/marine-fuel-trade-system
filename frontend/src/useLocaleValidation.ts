import { useEffect } from "react";
import type { FormInstance } from "antd";
import { useTranslation } from "react-i18next";

// Re-render existing validation messages without resetting field values.
export function useLocaleValidation(form: FormInstance) {
  const { i18n } = useTranslation();
  useEffect(() => {
    const invalid = form
      .getFieldsError()
      .filter((field) => field.errors.length)
      .map((field) => field.name);
    if (invalid.length) void form.validateFields(invalid).catch(() => {});
  }, [form, i18n.language]);
}
