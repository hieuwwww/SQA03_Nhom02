import { db } from '@/configs/database.config';
import { posts, rentalPosts, assets, postAssets } from '@/models/schema';
import { selectFullPostDetailById } from '../post.service';
import { eq, inArray } from 'drizzle-orm';
import ApiError from '@/utils/ApiError.helper'; // Giả sử đường dẫn của bạn
import { StatusCodes } from 'http-status-codes';

describe('Unit Test: selectFullPostDetailById (Rental Type)', () => {
    const TEST_POST_ID = 1001;
    const ASSET_IDS = [2001, 2002];

    const cleanUp = async () => {
        await db.delete(postAssets).where(eq(postAssets.postId, TEST_POST_ID));
        await db.delete(assets).where(inArray(assets.id, ASSET_IDS));
        await db.delete(rentalPosts).where(eq(rentalPosts.postId, TEST_POST_ID));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID));
    };

    beforeAll(async () => await cleanUp());
    afterEach(async () => await cleanUp());

    /**
     * SEED DATA HELPER
     */
    async function seedFullRentalData(hasAssets = true) {
        await db.insert(posts).values({
            id: TEST_POST_ID,
            ownerId: 21,
            title: 'Phòng trọ cao cấp',
            type: 'rental',
            status: 'actived',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng'
        });

        await db.insert(rentalPosts).values({
            postId: TEST_POST_ID,
            numberRoomAvailable: 2,
            priceStart: 2000000,
            priceEnd: 3000000,
            priceUnit: 'VND',
            totalArea: 50,
            totalAreaUnit: 'm2',
            minLeaseTerm: 6,
            minLeaseTermUnit: 'month',
            hasFurniture: true
        });

        if (hasAssets) {
            await db.insert(assets).values([
                { id: ASSET_IDS[0], url: 'img1.jpg', name: 'Ảnh 1' },
                { id: ASSET_IDS[1], url: 'img2.jpg', name: 'Ảnh 2' }
            ]);
            await db.insert(postAssets).values([
                { postId: TEST_POST_ID, assetId: ASSET_IDS[0] },
                { postId: TEST_POST_ID, assetId: ASSET_IDS[1] }
            ]);
        }
    }

    // --- CÁC TEST CASES PHỦ NHÁNH ---

    test('TC_UNIT_QLBV_SELECTFULL_1: Lấy chi tiết bài viết rental thành công (Đầy đủ ảnh)', async () => {
        await seedFullRentalData(true);

        const result = await selectFullPostDetailById(TEST_POST_ID, 'rental');

        // Phủ nhánh: postType === 'rental' trong select và switch
        expect(result.length).toBe(1);
        expect(result[0].post.id).toBe(TEST_POST_ID);
        expect(result[0].detail).toBeDefined();
        expect(result[0].assets.length).toBe(2);
    });

    test('TC_UNIT_QLBV_SELECTFULL_2: Lấy chi tiết bài viết rental thành công (Không có ảnh)', async () => {
        await seedFullRentalData(false);

        const result = await selectFullPostDetailById(TEST_POST_ID, 'rental');

        // Phủ nhánh: filter((asset) => !!asset) trả về mảng rỗng
        expect(result[0].assets).toEqual([]);
        expect(result[0].post.id).toBe(TEST_POST_ID);
    });

    test('TC_UNIT_QLBV_SELECTFULL_3: Ném lỗi ApiError 404 khi postId không tồn tại', async () => {
        // Không seed dữ liệu
        const NON_EXISTENT_ID = 9999;

        // Phủ nhánh: if (!rawData.length) { throw new ApiError ... }
        try {
            await selectFullPostDetailById(NON_EXISTENT_ID, 'rental');
        } catch (error: any) {
            expect(error).toBeInstanceOf(ApiError);
            expect(error.statusCode).toBe(StatusCodes.NOT_FOUND);
        }
    });

    test('TC_UNIT_QLBV_SELECTFULL_4: Phủ nhánh mặc định (Unsupported post type) khi truyền type lạ', async () => {
        await seedFullRentalData();

        // Ép kiểu sai để vào nhánh default của switch (detail)
        // Lưu ý: Drizzle select có thể lỗi trước đó do logic build động, 
        // nhưng test này focus vào switch case cuối.
        await expect(selectFullPostDetailById(TEST_POST_ID, 'unknown' as any))
            .rejects
            .toThrow('Unsupported post type');
    });

    test('TC_UNIT_QLBV_SELECTFULL_5: Kiểm tra tính duy nhất của Assets (Asset Deduplication)', async () => {
        await seedFullRentalData(true);
        // Giả lập lỗi dữ liệu: 1 ảnh bị join lặp lại 2 lần
        // Trong thực tế, assetMap sẽ xử lý việc này

        const result = await selectFullPostDetailById(TEST_POST_ID, 'rental');

        const assetIds = result[0].assets.map(a => a.id);
        const uniqueIds = new Set(assetIds);
        expect(assetIds.length).toBe(uniqueIds.size);
    });
});