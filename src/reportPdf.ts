import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { API_URL, ApiError } from "./api";

export async function shareAttendancePdf(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  const url = `${API_URL}/reports/attendance.pdf${query ? `?${query}` : ""}`;
  const name = `attendance-${from ?? "from"}-to-${to ?? "to"}.pdf`;
  const folder = FileSystem.cacheDirectory;
  if (!folder) throw new ApiError("This phone cannot save a PDF.");
  const dest = `${folder}${name}`;
  const downloaded = await FileSystem.downloadAsync(url, dest, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (downloaded.status !== 200) {
    throw new ApiError(downloaded.status === 401 ? "Sign in again" : "Could not make the PDF");
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError("This phone cannot share files.");
  }
  await Sharing.shareAsync(downloaded.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "Attendance report",
  });
}

export async function sharePayrollPdf(token: string, period?: string, employeeId?: string) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (employeeId) params.set("employeeId", employeeId);
  const query = params.toString();
  const url = `${API_URL}/payroll.pdf${query ? `?${query}` : ""}`;
  const folder = FileSystem.cacheDirectory;
  if (!folder) throw new ApiError("This phone cannot save a PDF.");
  const dest = `${folder}payslip-${period ?? "now"}.pdf`;
  const downloaded = await FileSystem.downloadAsync(url, dest, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (downloaded.status !== 200) {
    throw new ApiError(downloaded.status === 401 ? "Sign in again" : "Could not make the PDF");
  }
  if (!(await Sharing.isAvailableAsync())) throw new ApiError("This phone cannot share files.");
  await Sharing.shareAsync(downloaded.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "Payslip",
  });
}
