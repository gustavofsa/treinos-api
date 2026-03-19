import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

const WEEK_DAYS: WeekDay[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

interface InputDto {
  userId: string;
  date: string; // YYYY-MM-DD
}

interface OutputDto {
  activeWorkoutPlanId: string;
  todayWorkoutDay: {
    workoutPlanId: string;
    id: string;
    name: string;
    isRest: boolean;
    weekDay: WeekDay;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string;
    exercisesCount: number;
  };
  workoutStreak: number;
  consistencyByDay: {
    [key: string]: {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    };
  };
}

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const date = dayjs.utc(dto.date);

    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: {
          include: {
            _count: { select: { exercises: true } },
            sessions: true,
          },
        },
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("No active workout plan found");
    }

    // Find today's workout day
    const todayWeekDay = WEEK_DAYS[date.day()];
    const todayWorkoutDay = workoutPlan.workoutDays.find(
      (d) => d.weekDay === todayWeekDay,
    );

    if (!todayWorkoutDay) {
      throw new NotFoundError("No workout day found for today");
    }

    // Build consistencyByDay for the full week (Sunday to Saturday)
    const weekStart = date.startOf("week");
    const weekEnd = date.endOf("week");

    const consistencyByDay: OutputDto["consistencyByDay"] = {};
    for (let i = 0; i < 7; i++) {
      const key = weekStart.add(i, "day").format("YYYY-MM-DD");
      consistencyByDay[key] = {
        workoutDayCompleted: false,
        workoutDayStarted: false,
      };
    }

    const allSessions = workoutPlan.workoutDays.flatMap((d) => d.sessions);

    for (const session of allSessions) {
      const sessionDate = dayjs.utc(session.startedAt);
      if (
        sessionDate.valueOf() >= weekStart.valueOf() &&
        sessionDate.valueOf() <= weekEnd.valueOf()
      ) {
        const key = sessionDate.format("YYYY-MM-DD");
        if (consistencyByDay[key] !== undefined) {
          consistencyByDay[key].workoutDayStarted = true;
          if (session.completedAt) {
            consistencyByDay[key].workoutDayCompleted = true;
          }
        }
      }
    }

    // Calculate workout streak
    const workoutDayByWeekDay = new Map(
      workoutPlan.workoutDays.map((d) => [d.weekDay, d]),
    );

    const completedDates = new Set(
      allSessions
        .filter((s) => s.completedAt !== null)
        .map((s) => dayjs.utc(s.startedAt).format("YYYY-MM-DD")),
    );

    let workoutStreak = 0;
    let currentDate = date;

    for (let i = 0; i < 365; i++) {
      const currentWeekDay = WEEK_DAYS[currentDate.day()];
      const workoutDay = workoutDayByWeekDay.get(currentWeekDay);

      if (!workoutDay) {
        currentDate = currentDate.subtract(1, "day");
        continue;
      }

      if (workoutDay.isRest) {
        workoutStreak++;
      } else {
        const dateKey = currentDate.format("YYYY-MM-DD");
        if (completedDates.has(dateKey)) {
          workoutStreak++;
        } else {
          break;
        }
      }

      currentDate = currentDate.subtract(1, "day");
    }

    return {
      activeWorkoutPlanId: workoutPlan.id,
      todayWorkoutDay: {
        workoutPlanId: workoutPlan.id,
        id: todayWorkoutDay.id,
        name: todayWorkoutDay.name,
        isRest: todayWorkoutDay.isRest,
        weekDay: todayWorkoutDay.weekDay,
        estimatedDurationInSeconds: todayWorkoutDay.estimatedDurationInSeconds,
        coverImageUrl: todayWorkoutDay.coverImageUrl ?? undefined,
        exercisesCount: todayWorkoutDay._count.exercises,
      },
      workoutStreak,
      consistencyByDay,
    };
  }
}
