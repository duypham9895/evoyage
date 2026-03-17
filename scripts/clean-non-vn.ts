import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete stations with Chinese/non-Vietnam operator names
  const deleted = await prisma.chargingStation.deleteMany({
    where: {
      OR: [
        { provider: { contains: '公司' } },
        { provider: { contains: '电网' } },
        { provider: { contains: '石化' } },
        { provider: { contains: '北投' } },
        { provider: { contains: '中国' } },
        { provider: { contains: '广' } },
        { provider: { contains: '特来电' } },
        { provider: { contains: '云快充' } },
        { provider: { contains: '长沙' } },
        { provider: { contains: '蔚来' } },
        { provider: { contains: '雄安' } },
        { provider: { contains: '天天' } },
        { provider: { contains: '全享' } },
        { provider: { contains: 'зарядка' } },
        { name: { contains: '充电站' } },
        { name: { contains: '充电桩' } },
      ],
    },
  });

  console.log(`Deleted ${deleted.count} non-Vietnam stations`);

  // Also delete stations clearly outside Vietnam (lat/lng check)
  const outOfBounds = await prisma.chargingStation.deleteMany({
    where: {
      OR: [
        { latitude: { gt: 23.5 } },
        { latitude: { lt: 8.0 } },
        { longitude: { gt: 110.0 } },
        { longitude: { lt: 102.0 } },
      ],
    },
  });

  console.log(`Deleted ${outOfBounds.count} out-of-bounds stations`);

  const total = await prisma.chargingStation.count();
  const vf = await prisma.chargingStation.count({ where: { isVinFastOnly: true } });
  console.log(`\nRemaining: ${total} (VinFast: ${vf}, Universal: ${total - vf})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
