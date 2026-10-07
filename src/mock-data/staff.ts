import type { Department, Employee } from "@/types";

/** Demo departments / employees used by "Phân công". Replace with the HR master when it exists. */
export const DEPARTMENTS: Department[] = [
  { id: "D-OPS", name: "Operations" },
  { id: "D-DOC", name: "Documentation" },
  { id: "D-CUS", name: "Customs" },
  { id: "D-SAL", name: "Sales" },
];

export const EMPLOYEES: Employee[] = [
  { id: "E-001", name: "Nguyễn Văn A", departmentId: "D-OPS" },
  { id: "E-002", name: "Lê Thị Hoa", departmentId: "D-OPS" },
  { id: "E-003", name: "Trần Minh B", departmentId: "D-DOC" },
  { id: "E-004", name: "Phạm Thu Trang", departmentId: "D-DOC" },
  { id: "E-005", name: "Võ Quốc Huy", departmentId: "D-CUS" },
  { id: "E-006", name: "Đặng Ngọc Mai", departmentId: "D-SAL" },
];

export const departmentName = (id: string) => DEPARTMENTS.find((d) => d.id === id)?.name ?? id;
export const employeeName = (id: string | null) =>
  id ? (EMPLOYEES.find((e) => e.id === id)?.name ?? id) : "Cả phòng";
export const employeesOf = (departmentId: string) =>
  EMPLOYEES.filter((e) => e.departmentId === departmentId);
