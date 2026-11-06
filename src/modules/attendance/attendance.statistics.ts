export interface AttendanceStatisticsInput {
  expected: number;
  present: number;
  absent: number;
  late: number;
}

export interface AttendanceStatistics {
  totalExpected: number;
  present: number;
  absent: number;
  late: number;
  unmarked: number;
  attendancePercentage: number | null;
}

export function calculateAttendanceStatistics(
  input: AttendanceStatisticsInput,
): AttendanceStatistics {
  const marked = input.present + input.absent + input.late;
  return {
    totalExpected: input.expected,
    present: input.present,
    absent: input.absent,
    late: input.late,
    unmarked: Math.max(0, input.expected - marked),
    attendancePercentage: marked === 0 ? null : ((input.present + input.late) / marked) * 100,
  };
}
