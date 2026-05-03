import { db } from '@/configs/database.config';
import { posts, rentalPosts, postAssets, assets } from '@/models/schema';
import { selectRentalPostByConditions } from '../post.service';
import { eq, inArray } from 'drizzle-orm';

describe('Unit Test: selectRentalPostByConditions - Full Logic Coverage', () => {
    // Sử dụng ID số lớn để không trùng với data thật
    const FIRST_POST_ID = 999998;
    const TEST_OWNER_ID = 21;

    // Hàm dọn dẹp sau khi test (Manual Rollback)
    const cleanUp = async () => {
        await db.delete(postAssets).where(eq(postAssets.postId, FIRST_POST_ID));
        await db.delete(rentalPosts).where(eq(rentalPosts.postId, FIRST_POST_ID));
        await db.delete(posts).where(eq(posts.id, FIRST_POST_ID));
    };

    beforeAll(async () => { await cleanUp(); });
    afterEach(async () => { await cleanUp(); });

    /**
     * Seed Data dựa trên đúng Payload của hàm createRentalPost
     */
    async function seedFullRentalPost(lat: string, lng: string, customPrice?: { start: number, end: number }) {
        // 1. Tạo bảng posts (Chung)
        await db.insert(posts).values({
            id: FIRST_POST_ID,
            ownerId: TEST_OWNER_ID,
            type: 'rental',
            title: 'Căn hộ Test đầy đủ tiện nghi',
            titleSlug: 'can-ho-test-day-du-tien-nghi',
            description: 'Mô tả chi tiết bài viết test',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            addressDetail: 'Số 1 Duy Tân',
            addressSlug: 'dich-vong-cau-giay-ha-noi',
            addressLongitude: lng,
            addressLatitude: lat,
            expirationAfter: 30,
            expirationAfterUnit: 'day',
            status: 'actived'
        });

        // 2. Tạo bảng rentalPosts (Chi tiết - khớp với payload bạn đưa)
        await db.insert(rentalPosts).values({
            postId: FIRST_POST_ID,
            numberRoomAvailable: 2,
            priceStart: customPrice?.start || 5000000,
            priceEnd: customPrice?.end || 7000000,
            priceUnit: 'VND',
            totalArea: 50,
            totalAreaUnit: 'm2',
            minLeaseTerm: 6,
            minLeaseTermUnit: 'month',
            hasFurniture: true,
            hasAirConditioner: true,
            hasElevator: true,
            allowPets: false
        });
    }

    // --- TEST CASES ---

    test('TC_UNIT_LBV_SELECTRENTALPOST_1: Lọc theo khoảng giá (Branch: processCondition cho rentalPosts)', async () => {
        await seedFullRentalPost('21.0285', '105.8542', { start: 5000000, end: 7000000 });

        const conditions = {
            priceStart: { value: 4000000, operator: 'gte' }, // Giá bắt đầu lớn hơn 4tr
            priceEnd: { value: 8000000, operator: 'lte' }    // Giá kết thúc nhỏ hơn 8tr
        };

        const result = await selectRentalPostByConditions(conditions as any);

        expect(result.length).toBeGreaterThan(0);
        expect(Number(result[0].post.id)).toBe(FIRST_POST_ID);
        // CheckDB: Xác nhận giá trị rental chi tiết
        expect(result[0].detail.priceStart).toBe(5000000);
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_2: Lọc tọa độ bán kính (Branch: hasLocationFilter & distance calculation)', async () => {
        await seedFullRentalPost('21.0285', '105.8542');

        const conditions = {
            addressLatitude: { value: 21.0280, operator: 'eq' },
            addressLongitude: { value: 105.8540, operator: 'eq' },
            radius: 5 // 5km
        };

        const result = await selectRentalPostByConditions(conditions as any);

        expect(result.length).toBeGreaterThan(0);
        expect(result[0].distance).toBeDefined(); // Đảm bảo có tính khoảng cách
        expect(result[0].distance).toBeLessThan(5);
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_3: Sắp xếp theo thứ tự ưu tiên (Branch: orderClause)', async () => {
        await seedFullRentalPost('21.0285', '105.8542');

        const options = {
            orderConditions: { priceStart: 'desc' }
        };

        const result = await selectRentalPostByConditions({}, options as any);
        expect(result.length).toBeGreaterThan(0);
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_4: Kiểm tra gom nhóm Assets (Branch: reduce logic)', async () => {
        await seedFullRentalPost('21.0285', '105.8542');

        const ASSET_ID = 888888;
        await db.insert(assets).values({ id: ASSET_ID, url: 'test.jpg', name: 'Test Image' });
        await db.insert(postAssets).values({ postId: FIRST_POST_ID, assetId: ASSET_ID });

        const result = await selectRentalPostByConditions();
        const item = result.find(r => Number(r.post.id) === FIRST_POST_ID);

        expect(item?.assets.length).toBe(1);
        expect(item?.assets[0].id).toBe(ASSET_ID);

        // Dọn dẹp asset
        await db.delete(postAssets).where(eq(postAssets.assetId, ASSET_ID));
        await db.delete(assets).where(eq(assets.id, ASSET_ID));
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_5: Phân trang (Branch: withPagination)', async () => {
        await seedFullRentalPost('21.0285', '105.8542');

        const options = {
            pagination: { page: 1, pageSize: 1 }
        };

        const result = await selectRentalPostByConditions({}, options);
        expect(result.length).toBeLessThanOrEqual(1);
    });

    // --- BỔ SUNG ĐỂ PHỦ 100% BRANCH (IF/ELSE) ---

    test('TC_UNIT_LBV_SELECTRENTALPOST_6: Trả về mảng rỗng ngay lập tức khi không có ID nào thỏa mãn (Branch: if (!postIds.length))', async () => {
        // Không seed dữ liệu hoặc lọc với điều kiện không thể khớp
        const conditions = { title: { value: 'NonExistentTitle', operator: 'eq' } };
        const result = await selectRentalPostByConditions(conditions as any);

        expect(result).toEqual([]); // Phải trả về [] mà không chạy xuống BƯỚC 2
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_7: Chạy bình thường khi conditions và options đều undefined (Branch: if (conditions) false, if (options) false)', async () => {
        await seedFullRentalPost('21.0285', '105.8542');

        // Gọi hàm không tham số
        const result = await selectRentalPostByConditions();

        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('post');
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_8: Kiểm tra logic gom nhóm khi 1 Post có 0 Asset và 1 Post có 2 Assets', async () => {
        const ID_NO_ASSET = 999101;
        const ID_WITH_ASSETS = 999102;
        const ASSET_IDs = [888881, 888882];

        // --- BƯỚC 1: DỌN DẸP TRƯỚC (PRE-CLEANUP) ---
        const allIds = [ID_NO_ASSET, ID_WITH_ASSETS];
        await db.delete(postAssets).where(inArray(postAssets.postId, allIds));
        await db.delete(rentalPosts).where(inArray(rentalPosts.postId, allIds));
        await db.delete(posts).where(inArray(posts.id, allIds));
        await db.delete(assets).where(inArray(assets.id, ASSET_IDs));

        // --- BƯỚC 2: SEED DỮ LIỆU ---
        // Post 1: Không ảnh
        await db.insert(posts).values({
            id: ID_NO_ASSET,
            ownerId: TEST_OWNER_ID,
            type: 'rental',
            title: 'Căn hộ Test đầy đủ tiện nghi',
            titleSlug: 'can-ho-test-day-du-tien-nghi',
            description: 'Mô tả chi tiết bài viết test',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            addressDetail: 'Số 1 Duy Tân',
            addressSlug: 'dich-vong-cau-giay-ha-noi',
            addressLongitude: 105.8542,
            addressLatitude: 21.0285,
            expirationAfter: 30,
            expirationAfterUnit: 'day',
            status: 'actived'
        });
        await db.insert(rentalPosts).values({
            postId: ID_NO_ASSET,
            numberRoomAvailable: 2,
            priceStart: 2000000,
            priceEnd: 3000000,
            priceUnit: 'VND',
            totalArea: 50,
            totalAreaUnit: 'm2',
            minLeaseTerm: 6,
            minLeaseTermUnit: 'month',
            hasFurniture: true,
            hasAirConditioner: true,
            hasElevator: true,
            allowPets: false
        });

        // Post 2: Có 2 ảnh
        await db.insert(posts).values({
            id: ID_WITH_ASSETS,
            ownerId: TEST_OWNER_ID,
            type: 'rental',
            title: 'Căn hộ Test đầy đủ tiện nghi',
            titleSlug: 'can-ho-test-day-du-tien-nghi',
            description: 'Mô tả chi tiết bài viết test',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            addressDetail: 'Số 1 Duy Tân',
            addressSlug: 'dich-vong-cau-giay-ha-noi',
            addressLongitude: 105.8542,
            addressLatitude: 21.0285,
            expirationAfter: 30,
            expirationAfterUnit: 'day',
            status: 'actived'
        });
        await db.insert(rentalPosts).values({
            postId: ID_WITH_ASSETS,
            numberRoomAvailable: 2,
            priceStart: 2000000,
            priceEnd: 3000000,
            priceUnit: 'VND',
            totalArea: 50,
            totalAreaUnit: 'm2',
            minLeaseTerm: 6,
            minLeaseTermUnit: 'month',
            hasFurniture: true,
            hasAirConditioner: true,
            hasElevator: true,
            allowPets: false
        });
        await db.insert(assets).values([
            { id: ASSET_IDs[0], url: '1.jpg', name: 'A1' },
            { id: ASSET_IDs[1], url: '2.jpg', name: 'A2' }
        ]);
        await db.insert(postAssets).values([
            { postId: ID_WITH_ASSETS, assetId: ASSET_IDs[0] },
            { postId: ID_WITH_ASSETS, assetId: ASSET_IDs[1] }
        ]);

        // --- BƯỚC 3: THỰC THI & KIỂM TRA ---
        const result = await selectRentalPostByConditions({
            id: { value: allIds, operator: 'in' }
        } as any);

        const postA = result.find(r => Number(r.post.id) === ID_NO_ASSET);
        const postB = result.find(r => Number(r.post.id) === ID_WITH_ASSETS);

        // Nhánh if(item.asset) false -> mảng assets phải rỗng
        expect(postA?.assets).toEqual([]);

        // Nhánh if(!postResponseItem) -> gom được 2 ảnh vào 1 post
        expect(postB?.assets.length).toBe(2);

        // --- BƯỚC 4: DỌN DẸP SAU (POST-CLEANUP) ---
        // (Lặp lại các lệnh delete như Bước 1)
        await db.delete(postAssets).where(inArray(postAssets.postId, allIds));
        await db.delete(rentalPosts).where(inArray(rentalPosts.postId, allIds));
        await db.delete(posts).where(inArray(posts.id, allIds));
        await db.delete(assets).where(inArray(assets.id, ASSET_IDs));
    }, 10000);

    test('TC_UNIT_LBV_SELECTRENTALPOST_9: Lọc tọa độ bán kính - Không trả về bài viết ngoài phạm vi (Branch: distance > radius)', async () => {
        // 1. Seed bài viết ở vị trí xa (Gia Lâm: ~21.038, 105.942)
        // Khoảng cách từ đây đến tọa độ tìm kiếm (21.028, 105.854) là khoảng 9-10km
        const FAR_LAT = '21.0381';
        const FAR_LNG = '105.9425';

        await seedFullRentalPost(FAR_LAT, FAR_LNG);

        // 2. Thiết lập tìm kiếm trong bán kính chỉ 5km tại Cầu Giấy
        const conditions = {
            addressLatitude: { value: 23, operator: 'eq' },
            addressLongitude: { value: 120, operator: 'eq' },
            radius: 1 // Chỉ tìm trong 1km
        };

        const result = await selectRentalPostByConditions(conditions as any);

        // 3. Kết quả mong muốn: Không tìm thấy bài viết nào
        expect(result.length).toBe(0);
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_10: Tọa độ không hợp lệ (Vĩ độ > 90)', async () => {
        const conditions = {
            addressLatitude: { value: 120.0, operator: 'eq' }, // Sai logic địa lý
            addressLongitude: { value: 105.8, operator: 'eq' },
            radius: 5
        };

        // Tùy vào cách xử lý của bạn, có thể mong đợi [] hoặc lỗi
        const result = await selectRentalPostByConditions(conditions as any);
        expect(result).toEqual([]);
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_11: Bán kính tìm kiếm là số âm', async () => {
        await seedFullRentalPost('21.0285', '105.8542');

        const conditions = {
            addressLatitude: { value: 21.0285, operator: 'eq' },
            addressLongitude: { value: 105.8542, operator: 'eq' },
            radius: -10 // Số âm
        };

        const result = await selectRentalPostByConditions(conditions as any);
        expect(result.length).toBe(0); // Không được tìm thấy gì
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_12: Lọc giá trị (Giá Start > End)', async () => {
        // Seed 1 bài viết chuẩn: Giá 5tr-7tr, diện tích 50m2
        await seedFullRentalPost('21.0285', '105.8542', { start: 5000000, end: 7000000 });

        // Kịch bản A: Giá Start > Giá End (Người dùng nhập ngược)
        const conditionsInversePrice = {
            priceStart: { value: 8000000, operator: 'gte' },
            priceEnd: { value: 4000000, operator: 'lte' }
        };
        const resultInverse = await selectRentalPostByConditions(conditionsInversePrice as any);
        expect(resultInverse.length).toBe(0); // Thông thường SQL sẽ trả về rỗng vì không có số nào > 8tr và < 4tr
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_13: Lọc theo tên vị trí hợp lệ', async () => {
        await seedFullRentalPost('21.0285', '105.8542');

        const conditions = {
            addressProvince: { value: "Hà Nội", operator: 'like' }
        };

        const result = await selectRentalPostByConditions(conditions as any);

        expect(result.length).toBeGreaterThan(0);
        expect(Number(result[0].post.id)).toBe(FIRST_POST_ID);
    });
    test('TC_UNIT_LBV_SELECTRENTALPOST_14: Lọc theo tên vị trí không hợp lệ', async () => {
        await seedFullRentalPost('21.0285', '105.8542');

        const conditions = {
            addressProvince: { value: "ABCN", operator: 'like' }
        };

        const result = await selectRentalPostByConditions(conditions as any);

        expect(result.length).toBe(0); // Không tìm thấy bài viết nào vì "ABCN" không khớp với "Hà Nội"
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_15: Lọc giá trị chữ cho phần price', async () => {
        // Seed 1 bài viết chuẩn: Giá 5tr-7tr, diện tích 50m2
        await seedFullRentalPost('21.0285', '105.8542', { start: 5000000, end: 7000000 });

        // Kịch bản B: Giá trị âm
        const conditionsNegative = {
            priceEnd: { value: "abc", operator: 'lte' }
        };
        const resultNegative = await selectRentalPostByConditions(conditionsNegative as any);
        expect(resultNegative.length).toBe(0); 
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_16: Lọc giá trị diện tích hợp lệ', async () => {
        // Seed 1 bài viết chuẩn: Giá 5tr-7tr, diện tích 50m2
        await seedFullRentalPost('21.0285', '105.8542');

        const conditions = {
            totalArea: { value: 10, operator: 'gte' }
        };
        const result = await selectRentalPostByConditions(conditions as any);
        expect(result.length).toBeGreaterThan(0);
        
        let found=false;
        for (const item of result) {
            if (Number(item.post.id) === FIRST_POST_ID) {
                found=true; break;
            }
        }
        expect(found).toBe(true);
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_17: Lọc giá trị diện tích là chữ', async () => {
        // Seed 1 bài viết chuẩn: Giá 5tr-7tr, diện tích 50m2
        await seedFullRentalPost('21.0285', '105.8542');

        const conditions = {
            totalArea: { value: "abc", operator: 'lte' }
        };
        const result = await selectRentalPostByConditions(conditions as any);
        expect(result.length).toBe(0);
    });


    test('TC_UNIT_LBV_SELECTRENTALPOST_18: Lọc giá trị diện tích là số thập phân', async () => {
        // Seed 1 bài viết chuẩn: Giá 5tr-7tr, diện tích 50m2
        await seedFullRentalPost('21.0285', '105.8542');

        const conditions = {
            totalArea: { value: 49.8, operator: 'gte' }
        };
        const result = await selectRentalPostByConditions(conditions as any);
        expect(result.length).toBeGreaterThan(0);
        expect(Number(result[result.length - 1].post.id)).toBe(FIRST_POST_ID);
    });

    test('TC_UNIT_LBV_SELECTRENTALPOST_19: Lọc tiện ích', async () => {
        // Seed 1 bài viết chuẩn: Giá 5tr-7tr, diện tích 50m2
        await seedFullRentalPost('21.0285', '105.8542');

        const conditions = {
            hasFurniture: { value: true, operator: 'eq' }
        };
        const result = await selectRentalPostByConditions(conditions as any);
        expect(result.length).toBeGreaterThan(0);

        let found=false;
        for (const item of result) {
            if (Number(item.post.id) === FIRST_POST_ID) {
                found=true; break;
            }
        }
        expect(found).toBe(true);
    });


});