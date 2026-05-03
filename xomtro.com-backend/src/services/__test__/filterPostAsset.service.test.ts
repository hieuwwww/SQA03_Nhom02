import { db } from '@/configs/database.config';
import { posts, assets, postAssets } from '@/models/schema';
import { selectPostAssetsByPostId } from '../post.service'; // Điều chỉnh đường dẫn thực tế
import { eq, inArray } from 'drizzle-orm';

describe('Unit Test: selectPostAssetsByPostId', () => {
  const TEST_POST_ID = 777101;
  const TEST_USER_ID = 21;
  const OTHER_POST_ID = 777102;
  const ASSET_IDS = [666101, 666102, 666103];

  // Hàm dọn dẹp dữ liệu để đảm bảo tính độc lập giữa các test case
  const cleanUp = async () => {
    await db.delete(postAssets).where(inArray(postAssets.postId, [TEST_POST_ID, OTHER_POST_ID]));
    await db.delete(assets).where(inArray(assets.id, ASSET_IDS));
    await db.delete(posts).where(inArray(posts.id, [TEST_POST_ID, OTHER_POST_ID]));
  };

  beforeAll(async () => await cleanUp());
  afterEach(async () => await cleanUp());

  /**
   * Kịch bản chuẩn bị dữ liệu:
   * Post 1 có 2 ảnh.
   * Post 2 có 1 ảnh.
   */
  async function seedAssetsData() {
    // 1. Tạo Posts

    await db.insert(posts).values([
          {
            id: TEST_POST_ID,
            ownerId: TEST_USER_ID,
            title: 'Bài viết số 1',
            type: 'rental',
            titleSlug: 'can-ho-test-day-du-tien-nghi',
            description: 'Mô tả chi tiết bài viết test',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            addressDetail: 'Số 1 Duy Tân',
            addressSlug: 'dich-vong-cau-giay-ha-noi',
            addressLongitude: 102,
            addressLatitude: 21,
            expirationAfter: 30,
            expirationAfterUnit: 'day',
            status: 'actived'
          },
          {
            id: OTHER_POST_ID,
            ownerId: TEST_USER_ID,
            title: 'Bài viết số 2',
            type: 'wanted',
            titleSlug: 'can-ho-test-day-du-tien-nghi',
            description: 'Mô tả chi tiết bài viết test',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            addressDetail: 'Số 1 Duy Tân',
            addressSlug: 'dich-vong-cau-giay-ha-noi',
            addressLongitude: 102,
            addressLatitude: 21,
            expirationAfter: 30,
            expirationAfterUnit: 'day',
            status: 'actived'
          }
        ]);

    // 2. Tạo Assets
    await db.insert(assets).values([
      { id: ASSET_IDS[0], url: 'image1.jpg', name: 'Ảnh 1' },
      { id: ASSET_IDS[1], url: 'image2.jpg', name: 'Ảnh 2' },
      { id: ASSET_IDS[2], url: 'image3.jpg', name: 'Ảnh 3' },
    ]);

    // 3. Liên kết Assets vào Posts (Bảng trung gian)
    await db.insert(postAssets).values([
      { postId: TEST_POST_ID, assetId: ASSET_IDS[0] },
      { postId: TEST_POST_ID, assetId: ASSET_IDS[1] },
      { postId: OTHER_POST_ID, assetId: ASSET_IDS[2] },
    ]);
  }

  // --- CÁC TEST CASES ---

  test('TC_UNIT_LBV_SELECTPOSTASSETS_1: Lấy thành công danh sách ảnh của một bài viết cụ thể', async () => {
    await seedAssetsData();

    const result = await selectPostAssetsByPostId(TEST_POST_ID);

    // Kiểm tra số lượng ảnh trả về (Phải là 2)
    expect(result.length).toBe(2);
    
    // Kiểm tra tính chính xác của dữ liệu (Chứa đúng URL đã seed)
    const urls = result.map(a => a.url);
    expect(urls).toContain('image1.jpg');
    expect(urls).toContain('image2.jpg');
    expect(urls).not.toContain('image3.jpg'); // Ảnh này của post khác
  });

  test('TC_UNIT_LBV_SELECTPOSTASSETS_2: Trả về mảng rỗng nếu bài viết không có ảnh nào', async () => {
    // Chỉ tạo post, không tạo bản ghi trong postAssets
    await db.insert(posts).values({ 
        id: TEST_POST_ID, 
        ownerId: TEST_USER_ID,
            title: 'Bài viết số 2',
            type: 'wanted',
            titleSlug: 'can-ho-test-day-du-tien-nghi',
            description: 'Mô tả chi tiết bài viết test',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            addressDetail: 'Số 1 Duy Tân',
            addressSlug: 'dich-vong-cau-giay-ha-noi',
            addressLongitude: 102,
            addressLatitude: 21,
            expirationAfter: 30,
            expirationAfterUnit: 'day',
            status: 'actived'
    });

    const result = await selectPostAssetsByPostId(TEST_POST_ID);

    expect(result).toEqual([]);
    expect(result.length).toBe(0);
  });

  test('TC_UNIT_LBV_SELECTPOSTASSETS_3: Trả về mảng rỗng khi postId không tồn tại', async () => {
    const NON_EXISTENT_ID = 999999;
    
    const result = await selectPostAssetsByPostId(NON_EXISTENT_ID);

    expect(result).toEqual([]);
  });

  test('TC_UNIT_LBV_SELECTPOSTASSETS_4: Kiểm tra cấu trúc dữ liệu trả về (Schema match)', async () => {
    await seedAssetsData();

    const result = await selectPostAssetsByPostId(TEST_POST_ID);

    // Kiểm tra xem các trường trả về có đúng như assetModel không
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('url');
    expect(result[0]).toHaveProperty('name');
  });
});