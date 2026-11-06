import { describe, expect, it } from 'vitest';

import { calculateAttendanceStatistics } from '../src/modules/attendance/attendance.statistics.js';

describe('calculateAttendanceStatistics', () => {
  it('derives unmarked entries and excludes them from the attendance percentage', () => {
    expect(calculateAttendanceStatistics({ expected: 6, present: 2, absent: 1, late: 1 })).toEqual({
      totalExpected: 6,
      present: 2,
      absent: 1,
      late: 1,
      unmarked: 2,
      attendancePercentage: 75,
    });
  });

  it('returns a null percentage when no attendance records are marked', () => {
    expect(calculateAttendanceStatistics({ expected: 3, present: 0, absent: 0, late: 0 })).toEqual({
      totalExpected: 3,
      present: 0,
      absent: 0,
      late: 0,
      unmarked: 3,
      attendancePercentage: null,
    });
  });
});
