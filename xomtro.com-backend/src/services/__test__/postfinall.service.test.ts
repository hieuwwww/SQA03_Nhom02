import { insertPost, insertRentalPost, insertPostAssets } from '@/services/post.service';
import { insertAsset } from '@/services/asset.service';
import { db } from '@/configs/database.config';
import { posts, rentalPosts, postAssets, assets } from '@/models/schema';
import { desc, eq, inArray } from 'drizzle-orm';

jest.setTimeout(30000);

const waitInSeconds = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ─── Constants ────────────────────────────────────────────────────────────────
const validOwnerId = 24;
const nonExistentId = 999999;
const sleepTime = 7000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makePostPayload = (overrides = {}) => ({
  ownerId: validOwnerId,
  type: 'rental' as const,
  title: 'Cho thuê phòng quận 1',
  titleSlug: 'cho-thue-phong-quan-1',
  addressProvince: 'Hồ Chí Minh',
  addressDistrict: 'Quận 1',
  addressWard: 'Phường Bến Nghé',
  description: 'Phòng rộng thoáng mát',
  addressDetail: '123 Nguyễn Huệ',
  addressLongitude: '106.7009',
  addressLatitude: '10.7769',
  note: 'Gần trung tâm',
  expirationAfter: 30,
  expirationAfterUnit: 'day',
  ...overrides
});

const makeRentalPostPayload = (postId: number, overrides = {}) => ({
  postId,
  priceStart: 3000000,
  priceEnd: 5000000,
  priceUnit: 'vnd' as const,
  minLeaseTerm: 3,
  minLeaseTermUnit: 'month' as const,
  totalArea: 25,
  totalAreaUnit: 'm2' as const,
  ...overrides
});

const makeAssetPayload = (postId: number, overrides = {}) => ({
  userId: validOwnerId,
  postId,
  url: 'https://res.cloudinary.com/test/image/upload/posts/test.jpg',
  name: 'posts/test',
  format: 'jpg',
  folder: 'posts',
  type: 'image' as const,
  tags: JSON.stringify(['post']),
  ...overrides
});


// ═══════════════════════════════════════════════════════════════════════════════
// insertPost
// ═══════════════════════════════════════════════════════════════════════════════

describe('insertPost', () => {
  const insertedPostIds: number[] = [];

  afterEach(async () => {
    if (insertedPostIds.length) {
      await db.delete(rentalPosts).where(inArray(rentalPosts.postId, insertedPostIds)).catch(() => {});
      await db.delete(posts).where(inArray(posts.id, insertedPostIds)).catch(() => {});
      insertedPostIds.length = 0;
    }
  });

  // ── Happy path — cơ bản ────────────────────────────────────────────────────

  it('TCTBVM61: Insert post hợp lệ tối thiểu → trả về id mới là số', async () => {
    const result = await insertPost(makePostPayload() as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    console.log('TCTBVM61 hoàn thành - postId:', newId);
    await waitInSeconds(sleepTime);

    expect(newId).toBeDefined();
    expect(typeof newId).toBe('number');
  });

  it('TCTBVM62: Insert đầy đủ field → bản ghi tồn tại trong DB với đúng giá trị', async () => {
    const payload = makePostPayload({
      description: 'Phòng rộng thoáng mát',
      addressDetail: '123 Nguyễn Huệ',
      addressLongitude: '106.7009',
      addressLatitude: '10.7769',
      note: 'Gần trung tâm',
      expirationAfter: 30,
      expirationAfterUnit: 'day'
    });

    const result = await insertPost(payload as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));

    console.log('TCTBVM62 hoàn thành - postId:', newId);
    await waitInSeconds(sleepTime);

    expect(record).toBeDefined();
    expect(record.title).toBe(payload.title);
    expect(record.titleSlug).toBe(payload.titleSlug);
    expect(record.addressProvince).toBe(payload.addressProvince);
    expect(record.addressDistrict).toBe(payload.addressDistrict);
    expect(record.addressWard).toBe(payload.addressWard);
    expect(record.description).toBe(payload.description);
    expect(record.note).toBe(payload.note);
  });

  it('TCTBVM63: Insert field optional null → DB chấp nhận, lưu null đúng cột', async () => {
    const payload = makePostPayload({
      description: null,
      addressDetail: null,
      addressLongitude: null,
      addressLatitude: null,
      note: null
    });

    const result = await insertPost(payload as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));

    console.log('TCTBVM63 hoàn thành - postId:', newId);
    await waitInSeconds(sleepTime);

    expect(record.description).toBeNull();
    expect(record.note).toBeNull();
    expect(record.addressDetail).toBeNull();
    expect(record.addressLongitude).toBeNull();
    expect(record.addressLatitude).toBeNull();
  });

  // ── Happy path — status sau insert ────────────────────────────────────────

  it('TCTBVM64: Insert thành công → status mặc định là "actived"', async () => {
    const result = await insertPost(makePostPayload() as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));

    console.log('TCTBVM64 hoàn thành - status:', record?.status);
    await waitInSeconds(sleepTime);

    expect(record.status).toBe('actived');
    expect(record.status).not.toBeNull();
  });

  // ── Happy path — expirationAfter ──────────────────────────────────────────

  it('TCTBVM65: Không truyền expirationTime → DB lưu null ', async () => {
    const payload = makePostPayload({
      expirationAfter: undefined,
      expirationAfterUnit: undefined,
      expirationTime: undefined
    });

    const result = await insertPost(payload as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));

    console.log('TCTBVM65 hoàn thành - expirationTime:', record?.expirationTime);
    await waitInSeconds(sleepTime);

    expect(record.expirationTime).toBeNull();
  });

  it('TCTBVM66: expirationAfter = 30, expirationAfterUnit = "day" → DB lưu đúng, ', async () => {
    const expirationTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const payload = makePostPayload({
      expirationAfter: 30,
      expirationAfterUnit: 'day',
      expirationTime
    });

    const result = await insertPost(payload as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));

    console.log('TCTBVM66 hoàn thành - expirationAfter:', record?.expirationAfter, 'unit:', record?.expirationAfterUnit);
    await waitInSeconds(sleepTime);

    expect(record.expirationAfter).toBe(30);
    expect(record.expirationAfterUnit).toBe('day');

    const now = new Date();
    const min = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000);
    const max = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect(new Date(record.expirationTime!).getTime()).toBeGreaterThan(min.getTime());
    expect(new Date(record.expirationTime!).getTime()).toBeLessThan(max.getTime());
  });

  it('TCTBVM67: expirationAfter = 2, expirationAfterUnit = "week" ', async () => {
    const expirationTime = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const payload = makePostPayload({
      expirationAfter: 2,
      expirationAfterUnit: 'week',
      expirationTime
    });

    const result = await insertPost(payload as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));

    console.log('TCTBVM67 hoàn thành - expirationAfterUnit:', record?.expirationAfterUnit);
    await waitInSeconds(sleepTime);

    expect(record.expirationAfter).toBe(2);
    expect(record.expirationAfterUnit).toBe('week');

    const now = new Date();
    const min = new Date(now.getTime() + 13 * 24 * 60 * 60 * 1000);
    const max = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    expect(new Date(record.expirationTime!).getTime()).toBeGreaterThan(min.getTime());
    expect(new Date(record.expirationTime!).getTime()).toBeLessThan(max.getTime());
  });

  it('TCTBVM68: expirationAfter = 3, expirationAfterUnit = "month" → DB lưu đúng', async () => {
    const expirationTime = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const payload = makePostPayload({
      expirationAfter: 3,
      expirationAfterUnit: 'month',
      expirationTime
    });

    const result = await insertPost(payload as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));

    console.log('TCTBVM68 hoàn thành - expirationAfterUnit:', record?.expirationAfterUnit);
    await waitInSeconds(sleepTime);

    expect(record.expirationAfter).toBe(3);
    expect(record.expirationAfterUnit).toBe('month');

    const now = new Date();
    const min = new Date(now.getTime() + 88 * 24 * 60 * 60 * 1000);
    const max = new Date(now.getTime() + 92 * 24 * 60 * 60 * 1000);
    expect(new Date(record.expirationTime!).getTime()).toBeGreaterThan(min.getTime());
    expect(new Date(record.expirationTime!).getTime()).toBeLessThan(max.getTime());
  });

  it('TCTBVM69: expirationAfter = 12, expirationAfterUnit = "hour" → DB lưu đúng', async () => {
    const expirationTime = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const payload = makePostPayload({
      expirationAfter: 12,
      expirationAfterUnit: 'hour',
      expirationTime
    });

    const result = await insertPost(payload as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));

    console.log('TCTBVM69 hoàn thành - expirationAfterUnit:', record?.expirationAfterUnit);
    await waitInSeconds(sleepTime);

    expect(record.expirationAfter).toBe(12);
    expect(record.expirationAfterUnit).toBe('hour');

    const now = new Date();
    const min = new Date(now.getTime() + 11 * 60 * 60 * 1000);
    const max = new Date(now.getTime() + 13 * 60 * 60 * 1000);
    expect(new Date(record.expirationTime!).getTime()).toBeGreaterThan(min.getTime());
    expect(new Date(record.expirationTime!).getTime()).toBeLessThan(max.getTime());
  });

  it('TCTBVM70: expirationAfterUnit không hợp lệ (ngoài enum) → không insert được', async () => {
    const payload = makePostPayload({
      expirationAfter: 10,
      expirationAfterUnit: 'year'
    });
    await expect(insertPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM71: expirationAfterUnit = null, expirationTime truyền thẳng → DB lưu đúng', async () => {
    const expirationTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const payload = makePostPayload({
      expirationAfter: 30,
      expirationAfterUnit: null,
      expirationTime
    });

    const result = await insertPost(payload as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));

    console.log('TCTBVM71 hoàn thành - expirationAfterUnit:', record?.expirationAfterUnit);
    await waitInSeconds(sleepTime);

    expect(record.expirationAfter).toBe(30);
    expect(record.expirationAfterUnit).toBeNull();

    const now = new Date();
    const min = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000);
    const max = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect(new Date(record.expirationTime!).getTime()).toBeGreaterThan(min.getTime());
    expect(new Date(record.expirationTime!).getTime()).toBeLessThan(max.getTime());
  });

  // ── Negative cases ─────────────────────────────────────────────────────────

  it('TCTBVM72: Thiếu title (NOT NULL) → không insert được', async () => {
    const payload = makePostPayload({ title: undefined });
    await expect(insertPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM73: title = "" → DB chấp nhận ★ (BUG: thiếu CHECK constraint)', async () => {
    const result = await insertPost(makePostPayload({ title: '' }) as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));
    await waitInSeconds(sleepTime);

    expect(record.title).toBe('');
  });

  it('TCTBVM74: title chỉ toàn khoảng trắng → DB chấp nhận ', async () => {
    
    const result = await insertPost(makePostPayload({ title: '   ' }) as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);

    const [record] = await db.select().from(posts).where(eq(posts.id, newId));
    await waitInSeconds(sleepTime);

    expect(record.title).toBe('   ');
  });

  it('TCTBVM75: title quá dài (>255 ký tự) → không insert được', async () => {
    const payload = makePostPayload({ title: 'A'.repeat(256) });
    await expect(insertPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM76: ownerId không tồn tại (FK không hợp lệ) → không insert được', async () => {
    const payload = makePostPayload({ ownerId: nonExistentId });
    await expect(insertPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM77: ownerId thiếu (undefined) → DB chấp nhận ', async () => {
  
    const result = await insertPost(makePostPayload({ ownerId: undefined }) as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);
    await waitInSeconds(sleepTime);

    expect(newId).toBeDefined();
  });

  it('TCTBVM78: type không hợp lệ (ngoài enum) → không insert được', async () => {
    const payload = makePostPayload({ type: 'invalid_type' });
    await expect(insertPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM79: type thiếu (undefined) → DB chấp nhận ', async () => {
   
    const result = await insertPost(makePostPayload({ type: undefined }) as any);
    const newId = result[0].id;
    insertedPostIds.push(newId);
    await waitInSeconds(sleepTime);

    expect(newId).toBeDefined();
  });

  it('TCTBVM80: addressProvince thiếu → không insert được', async () => {
    const payload = makePostPayload({ addressProvince: undefined });
    await expect(insertPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM81: addressDistrict thiếu → không insert được', async () => {
    const payload = makePostPayload({ addressDistrict: undefined });
    await expect(insertPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM82: addressWard thiếu → không insert được', async () => {
    const payload = makePostPayload({ addressWard: undefined });
    await expect(insertPost(payload as any)).rejects.toThrow();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// insertRentalPost
// ═══════════════════════════════════════════════════════════════════════════════

describe('insertRentalPost', () => {
  let sharedPostId: number;
  const insertedPostIds: number[] = [];

  beforeEach(async () => {
    const result = await insertPost(makePostPayload() as any);
    sharedPostId = result[0].id;
    insertedPostIds.push(sharedPostId);
  });

  afterEach(async () => {
    if (insertedPostIds.length) {
      await db.delete(rentalPosts).where(inArray(rentalPosts.postId, insertedPostIds)).catch(() => {});
      await db.delete(posts).where(inArray(posts.id, insertedPostIds)).catch(() => {});
      insertedPostIds.length = 0;
    }
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('TCTBVM83: Insert rental post hợp lệ tối thiểu → bản ghi tồn tại trong DB', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId) as any);

    const [record] = await db
      .select()
      .from(rentalPosts)
      .where(eq(rentalPosts.postId, sharedPostId));

    console.log('TCTBVM83 hoàn thành - postId:', record?.postId);
    await waitInSeconds(sleepTime);

    expect(record).toBeDefined();
    expect(record.postId).toBe(sharedPostId);
    expect(record.priceStart).toBe(3000000);
    expect(record.priceEnd).toBe(5000000);
    expect(record.minLeaseTerm).toBe(3);
    expect(record.totalArea).toBe(25);
  });

  it('TCTBVM84: Insert đầy đủ tất cả field → DB lưu đúng toàn bộ giá trị', async () => {
    const payload = makeRentalPostPayload(sharedPostId, {
      hasFurniture: true,
      hasAirConditioner: true,
      hasWashingMachine: true,
      hasRefrigerator: true,
      hasPrivateBathroom: true,
      hasParking: true,
      hasSecurity: true,
      hasElevator: true,
      hasInternet: true,
      allowPets: true,
      numberRoomAvailable: 3
    });

    await insertRentalPost(payload as any);

    const [record] = await db
      .select()
      .from(rentalPosts)
      .where(eq(rentalPosts.postId, sharedPostId));

    console.log('TCTBVM84 hoàn thành - postId:', sharedPostId);
    await waitInSeconds(sleepTime);

    expect(record).toBeDefined();
    expect(record.priceStart).toBe(3000000);
    expect(record.priceEnd).toBe(5000000);
    expect(record.priceUnit).toBe('vnd');
    expect(record.minLeaseTerm).toBe(3);
    expect(record.minLeaseTermUnit).toBe('month');
    expect(record.totalArea).toBe(25);
    expect(record.totalAreaUnit).toBe('m2');
    expect(record.hasFurniture).toBe(true);
    expect(record.hasAirConditioner).toBe(true);
    expect(record.hasWashingMachine).toBe(true);
    expect(record.hasRefrigerator).toBe(true);
    expect(record.hasPrivateBathroom).toBe(true);
    expect(record.hasParking).toBe(true);
    expect(record.hasSecurity).toBe(true);
    expect(record.hasElevator).toBe(true);
    expect(record.hasInternet).toBe(true);
    expect(record.allowPets).toBe(true);
  });

  it('TCTBVM85: Insert nhiều lần cùng postId → throw lỗi )', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId) as any);

    await expect(
      insertRentalPost(makeRentalPostPayload(sharedPostId) as any)
    ).rejects.toThrow();
  });

  // ── Boolean amenity fields ──────────────────────────────────────────────────

  it('TCTBVM86: Không truyền bất kỳ boolean optional nào → tất cả mặc định false trong DB', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId) as any);

    const [record] = await db
      .select()
      .from(rentalPosts)
      .where(eq(rentalPosts.postId, sharedPostId));

    console.log('TCTBVM86 hoàn thành - postId:', sharedPostId);
    await waitInSeconds(sleepTime);

    const booleanFields = [
      'hasFurniture',
      'hasAirConditioner',
      'hasWashingMachine',
      'hasRefrigerator',
      'hasPrivateBathroom',
      'hasParking',
      'hasSecurity',
      'hasElevator',
      'hasInternet',
      'allowPets'
    ] as const;

    for (const field of booleanFields) {
      expect(record[field]).toBe(false);
      expect(record[field]).not.toBeNull();
    }
  });

  it('TCTBVM87: Tất cả boolean field = true → DB lưu đúng từng field ', async () => {
    const payload = makeRentalPostPayload(sharedPostId, {
      hasFurniture: true,
      hasAirConditioner: true,
      hasWashingMachine: true,
      hasRefrigerator: true,
      hasPrivateBathroom: true,
      hasParking: true,
      hasSecurity: true,
      hasElevator: true,
      hasInternet: true,
      allowPets: true
    });
    await insertRentalPost(payload as any);

    const [record] = await db
      .select()
      .from(rentalPosts)
      .where(eq(rentalPosts.postId, sharedPostId));

    console.log('TCTBVM87 hoàn thành - postId:', sharedPostId);
    await waitInSeconds(sleepTime);

    expect(record.hasFurniture).toBe(true);
    expect(record.hasAirConditioner).toBe(true);
    expect(record.hasWashingMachine).toBe(true);
    expect(record.hasRefrigerator).toBe(true);
    expect(record.hasPrivateBathroom).toBe(true);
    expect(record.hasParking).toBe(true);
    expect(record.hasSecurity).toBe(true);
    expect(record.hasElevator).toBe(true);
    expect(record.hasInternet).toBe(true);
    expect(record.allowPets).toBe(true);
  });

  it('TCTBVM88: Tất cả boolean field = false → DB lưu đúng từng field', async () => {
    const payload = makeRentalPostPayload(sharedPostId, {
      hasFurniture: false,
      hasAirConditioner: false,
      hasWashingMachine: false,
      hasRefrigerator: false,
      hasPrivateBathroom: false,
      hasParking: false,
      hasSecurity: false,
      hasElevator: false,
      hasInternet: false,
      allowPets: false
    });
    await insertRentalPost(payload as any);

    const [record] = await db
      .select()
      .from(rentalPosts)
      .where(eq(rentalPosts.postId, sharedPostId));

    console.log('TCTBVM88 hoàn thành - postId:', sharedPostId);
    await waitInSeconds(sleepTime);

    expect(record.hasFurniture).toBe(false);
    expect(record.hasAirConditioner).toBe(false);
    expect(record.hasWashingMachine).toBe(false);
    expect(record.hasRefrigerator).toBe(false);
    expect(record.hasPrivateBathroom).toBe(false);
    expect(record.hasParking).toBe(false);
    expect(record.hasSecurity).toBe(false);
    expect(record.hasElevator).toBe(false);
    expect(record.hasInternet).toBe(false);
    expect(record.allowPets).toBe(false);
  });

  it('TCTBVM89: Mix true/false trên các boolean field → DB lưu đúng từng giá trị', async () => {
    const payload = makeRentalPostPayload(sharedPostId, {
      hasFurniture: true,
      hasAirConditioner: true,
      hasWashingMachine: false,
      hasRefrigerator: false,
      hasPrivateBathroom: true,
      hasParking: false,
      hasSecurity: true,
      hasElevator: false,
      hasInternet: true,
      allowPets: false
    });
    await insertRentalPost(payload as any);

    const [record] = await db
      .select()
      .from(rentalPosts)
      .where(eq(rentalPosts.postId, sharedPostId));

    console.log('TCTBVM89 hoàn thành - postId:', sharedPostId);
    await waitInSeconds(sleepTime);

    expect(record.hasFurniture).toBe(true);
    expect(record.hasAirConditioner).toBe(true);
    expect(record.hasWashingMachine).toBe(false);
    expect(record.hasRefrigerator).toBe(false);
    expect(record.hasPrivateBathroom).toBe(true);
    expect(record.hasParking).toBe(false);
    expect(record.hasSecurity).toBe(true);
    expect(record.hasElevator).toBe(false);
    expect(record.hasInternet).toBe(true);
    expect(record.allowPets).toBe(false);
  });

  // ── priceStart ──────────────────────────────────────────────────────────────

  it('TCTBVM90: priceStart hợp lệ → DB lưu đúng giá trị', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { priceStart: 3000000 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    console.log('TCTBVM90 hoàn thành - priceStart:', record?.priceStart);
    await waitInSeconds(sleepTime);

    expect(record.priceStart).toBe(3000000);
  });

  it('TCTBVM91: priceStart = 0 → DB chấp nhận ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { priceStart: 0 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.priceStart).toBe(0);
  });

  it('TCTBVM92: priceStart âm → DB chấp nhận ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { priceStart: -1000000 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.priceStart).toBe(-1000000);
  });

  it('TCTBVM93: priceStart là NaN → không insert được', async () => {
    const payload = makeRentalPostPayload(sharedPostId, { priceStart: NaN });
    await expect(insertRentalPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM94: priceStart thiếu (undefined) → không insert được', async () => {
    const payload = makeRentalPostPayload(sharedPostId, { priceStart: undefined });
    await expect(insertRentalPost(payload as any)).rejects.toThrow();
  });

  // ── priceEnd ────────────────────────────────────────────────────────────────

  it('TCTBVM95: priceEnd hợp lệ → DB lưu đúng giá trị', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { priceEnd: 5000000 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    console.log('TCTBVM95 hoàn thành - priceEnd:', record?.priceEnd);
    await waitInSeconds(sleepTime);

    expect(record.priceEnd).toBe(5000000);
  });

  it('TCTBVM96: priceEnd = 0 → DB chấp nhận ', async () => {
   
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { priceEnd: 0 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.priceEnd).toBe(0);
  });

  it('TCTBVM97: priceEnd âm → DB chấp nhận ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { priceEnd: -500000 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.priceEnd).toBe(-500000);
  });

  it('TCTBVM98: priceEnd là NaN → không insert được', async () => {
    const payload = makeRentalPostPayload(sharedPostId, { priceEnd: NaN });
    await expect(insertRentalPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM99: priceEnd thiếu (undefined) → DB chấp nhận null ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { priceEnd: undefined }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.priceEnd).toBeNull();
  });

  it('TCTBVM100: priceEnd < priceStart → DB chấp nhận ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, {
      priceStart: 5000000,
      priceEnd: 1000000
    }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.priceStart).toBe(5000000);
    expect(record.priceEnd).toBe(1000000);
  });

  it('TCTBVM101: priceStart = priceEnd (giá cố định) → DB chấp nhận', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, {
      priceStart: 4000000,
      priceEnd: 4000000
    }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    console.log('TCTBVM101 hoàn thành - price:', record?.priceStart, record?.priceEnd);
    await waitInSeconds(sleepTime);

    expect(record.priceStart).toBe(4000000);
    expect(record.priceEnd).toBe(4000000);
  });

  // ── totalArea ───────────────────────────────────────────────────────────────

  it('TCTBVM102: totalArea hợp lệ → DB lưu đúng giá trị', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { totalArea: 30 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    console.log('TCTBVM102 hoàn thành - totalArea:', record?.totalArea);
    await waitInSeconds(sleepTime);

    expect(record.totalArea).toBe(30);
  });

  it('TCTBVM103: totalArea = 0 → DB chấp nhận ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { totalArea: 0 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.totalArea).toBe(0);
  });

  it('TCTBVM104: totalArea âm → DB chấp nhận ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { totalArea: -10 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.totalArea).toBe(-10);
  });

  it('TCTBVM105: totalArea là NaN → không insert được', async () => {
    const payload = makeRentalPostPayload(sharedPostId, { totalArea: NaN });
    await expect(insertRentalPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM106: totalArea thiếu (undefined) → DB chấp nhận null ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { totalArea: undefined }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.totalArea).toBeNull();
  });

  // ── minLeaseTerm ────────────────────────────────────────────────────────────

  it('TCTBVM107: minLeaseTerm hợp lệ → DB lưu đúng giá trị', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { minLeaseTerm: 6 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    console.log('TCTBVM107 hoàn thành - minLeaseTerm:', record?.minLeaseTerm);
    await waitInSeconds(sleepTime);

    expect(record.minLeaseTerm).toBe(6);
  });

  it('TCTBVM108: minLeaseTerm = 0 → DB chấp nhận ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { minLeaseTerm: 0 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.minLeaseTerm).toBe(0);
  });

  it('TCTBVM109: minLeaseTerm âm → DB chấp nhận ', async () => {
    await insertRentalPost(makeRentalPostPayload(sharedPostId, { minLeaseTerm: -3 }) as any);

    const [record] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, sharedPostId));
    await waitInSeconds(sleepTime);

    expect(record.minLeaseTerm).toBe(-3);
  });

  it('TCTBVM110: minLeaseTerm là NaN → không insert được', async () => {
    const payload = makeRentalPostPayload(sharedPostId, { minLeaseTerm: NaN });
    await expect(insertRentalPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM111: minLeaseTerm thiếu (undefined) → không insert được', async () => {
    const payload = makeRentalPostPayload(sharedPostId, { minLeaseTerm: undefined });
    await expect(insertRentalPost(payload as any)).rejects.toThrow();
  });

  // ── Enum không hợp lệ ───────────────────────────────────────────────────────

  it('TCTBVM112: priceUnit không hợp lệ → không insert được', async () => {
    const payload = makeRentalPostPayload(sharedPostId, { priceUnit: 'bitcoin' });
    await expect(insertRentalPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM113: minLeaseTermUnit không hợp lệ → không insert được', async () => {
    const payload = makeRentalPostPayload(sharedPostId, { minLeaseTermUnit: 'quarter' });
    await expect(insertRentalPost(payload as any)).rejects.toThrow();
  });

  it('TCTBVM114: totalAreaUnit không hợp lệ → không insert được', async () => {
    const payload = makeRentalPostPayload(sharedPostId, { totalAreaUnit: 'feet' });
    await expect(insertRentalPost(payload as any)).rejects.toThrow();
  });

  // ── FK không hợp lệ ─────────────────────────────────────────────────────────

  it('TCTBVM115: postId không tồn tại (FK không hợp lệ) → không insert được', async () => {
    await expect(
      insertRentalPost(makeRentalPostPayload(nonExistentId) as any)
    ).rejects.toThrow();
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// insertAsset
// ═══════════════════════════════════════════════════════════════════════════════

describe('insertAsset', () => {
  let sharedPostId: number;
  const insertedPostIds: number[] = [];
  const insertedAssetIds: number[] = [];

  beforeEach(async () => {
    const result = await insertPost(makePostPayload() as any);
    sharedPostId = result[0].id;
    insertedPostIds.push(sharedPostId);
  });

  afterEach(async () => {
    if (insertedAssetIds.length) {
      await db.delete(postAssets).where(inArray(postAssets.assetId, insertedAssetIds)).catch(() => {});
      await db.delete(assets).where(inArray(assets.id, insertedAssetIds)).catch(() => {});
      insertedAssetIds.length = 0;
    }
    if (insertedPostIds.length) {
      await db.delete(rentalPosts).where(inArray(rentalPosts.postId, insertedPostIds)).catch(() => {});
      await db.delete(posts).where(inArray(posts.id, insertedPostIds)).catch(() => {});
      insertedPostIds.length = 0;
    }
  });

  it('TCTBVM116: Insert 1 asset → trả về id là số', async () => {
    const result = await insertAsset([makeAssetPayload(sharedPostId)] as any);
    const newId = result[0].id;
    insertedAssetIds.push(newId);

    console.log('TCTBVM116 hoàn thành - assetId:', newId);
    await waitInSeconds(sleepTime);

    expect(newId).toBeDefined();
    expect(typeof newId).toBe('number');
  });

  it('TCTBVM117: Insert array nhiều asset → trả về nhiều id khác nhau', async () => {
    const payload = [
      makeAssetPayload(sharedPostId, { name: 'posts/img1', url: 'https://cloudinary.com/img1.jpg' }),
      makeAssetPayload(sharedPostId, { name: 'posts/img2', url: 'https://cloudinary.com/img2.jpg' }),
      makeAssetPayload(sharedPostId, { name: 'posts/img3', url: 'https://cloudinary.com/img3.jpg' })
    ];

    const result = await insertAsset(payload as any);
    result.forEach((r: any) => insertedAssetIds.push(r.id));

    console.log('TCTBVM117 hoàn thành - assetIds:', result.map((r: any) => r.id));
    await waitInSeconds(sleepTime);

    expect(result).toHaveLength(3);
    expect(new Set(result.map((r: any) => r.id)).size).toBe(3);
  });

  it('TCTBVM118: Insert asset → record tồn tại trong DB với đúng thông tin', async () => {
    const payload = makeAssetPayload(sharedPostId);
    const result = await insertAsset([payload] as any);
    const newId = result[0].id;
    insertedAssetIds.push(newId);

    const [record] = await db.select().from(assets).where(eq(assets.id, newId));

    console.log('TCTBVM118 hoàn thành - assetId:', newId);
    await waitInSeconds(sleepTime);

    expect(record.url).toBe(payload.url);
    expect(record.type).toBe('image');
    expect(record.folder).toBe('posts');
  });

  it('TCTBVM119: Array rỗng [] → không insert được', async () => {
    await expect(insertAsset([] as any)).rejects.toThrow();
  });

  it('TCTBVM120: userId không tồn tại (FK) → không insert được', async () => {
    const payload = makeAssetPayload(sharedPostId, { userId: nonExistentId });
    await expect(insertAsset([payload] as any)).rejects.toThrow();
  });

  it('TCTBVM121: postId không tồn tại (FK) → không insert được', async () => {
    const payload = makeAssetPayload(nonExistentId);
    await expect(insertAsset([payload] as any)).rejects.toThrow();
  });

  it('TCTBVM122: type không hợp lệ (ngoài enum) → không insert được', async () => {
    const payload = makeAssetPayload(sharedPostId, { type: 'pdf' });
    await expect(insertAsset([payload] as any)).rejects.toThrow();
  });
});