import { db } from '@/configs/database.config';
import { assets, posts } from '@/models/schema';
import { deletePostAssets } from '../post.service'; // Điều chỉnh đường dẫn
import { eq, inArray, and } from 'drizzle-orm';

describe('Unit Test: deletePostAssets', () => {
    const TEST_POST_ID = 888001;
    const OTHER_POST_ID = 888002;
    const ASSET_IDS = [9001, 9002, 9003];

    const cleanUp = async () => {
        await db.delete(assets).where(inArray(assets.id, [...ASSET_IDS, 9004]));
        await db.delete(posts).where(inArray(posts.id, [TEST_POST_ID, OTHER_POST_ID]));
    };

    beforeAll(async () => await cleanUp());
    afterEach(async () => await cleanUp());

    async function seedAssets() {
        await db.insert(posts).values([
            {
                id: TEST_POST_ID, ownerId: 21, title: 'Post 1', type: 'rental',
                status: 'actived', addressProvince: 'Hà Nội', addressDistrict: 'Cầu Giấy', addressWard: 'Dịch Vọng'
            },
            {
                id: OTHER_POST_ID, ownerId: 21, title: 'Post 2', type: 'rental',
                status: 'actived', addressProvince: 'Hà Nội', addressDistrict: 'Ba Đình', addressWard: 'Điện Biên Phủ'
            }
        ]);

        await db.insert(assets).values([
            { id: ASSET_IDS[0], postId: TEST_POST_ID, url: 'img1.jpg', name: 'Ảnh 1' },
            { id: ASSET_IDS[1], postId: TEST_POST_ID, url: 'img2.jpg', name: 'Ảnh 2' },
            { id: ASSET_IDS[2], postId: TEST_POST_ID, url: 'img3.jpg', name: 'Ảnh 3' },
            { id: 9004, postId: OTHER_POST_ID, url: 'img4.jpg', name: 'Ảnh 4' }, // Ảnh của post khác
        ]);
    }

    // --- CÁC TEST CASES PHỦ NHÁNH ---

    test('TC_UNIT_QLBV_DELETEPOSTASSET_1: Xóa một ảnh duy nhất (assetIds là number)', async () => {
        await seedAssets();

        // Nhánh: else { return db.delete... eq(assets.id, assetIds) }
        await deletePostAssets(TEST_POST_ID, ASSET_IDS[0]);

        const remaining = await db.select().from(assets).where(eq(assets.postId, TEST_POST_ID));
        expect(remaining.length).toBe(2);
        expect(remaining.map(a => a.id)).not.toContain(ASSET_IDS[0]);
    }, 10000);

    test('TC_UNIT_QLBV_DELETEPOSTASSET_2: Xóa danh sách ảnh (assetIds là array)', async () => {
        await seedAssets();

        // Nhánh: if (Array.isArray(assetIds))
        const idsToDelete = [ASSET_IDS[1], ASSET_IDS[2]];
        await deletePostAssets(TEST_POST_ID, idsToDelete);

        const remaining = await db.select().from(assets).where(eq(assets.postId, TEST_POST_ID));
        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe(ASSET_IDS[0]);
    }, 10000);

    test('TC_UNIT_QLBV_DELETEPOSTASSET_3: Đảm bảo tính an toàn - Không xóa ảnh của Post khác', async () => {
        await seedAssets();

        // Cố gắng xóa ảnh 9004 (của OTHER_POST_ID) nhưng truyền TEST_POST_ID
        await deletePostAssets(TEST_POST_ID, 9004);

        // Kiểm tra: Ảnh 9004 vẫn phải còn vì postId không khớp
        const checkAsset = await db.select().from(assets).where(eq(assets.id, 9004));
        expect(checkAsset.length).toBe(1);
    }, 10000);

    test('TC_UNIT_QLBV_DELETEPOSTASSET_4: Xóa ID không tồn tại hoặc ID âm', async () => {
        await seedAssets();

        // Test giá trị âm hoặc không tồn tại để kiểm tra độ vững chãi
        await expect(deletePostAssets(TEST_POST_ID, -1)).resolves.not.toThrow();
        await expect(deletePostAssets(TEST_POST_ID, [999, 888])).resolves.not.toThrow();
    }, 10000);
});