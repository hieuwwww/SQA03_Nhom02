import {
  insertComment,
  selectCommentByConditions,
  updateCommentByCommentId,
  deleteCommentByConditions,
  selectPostLevel1Comments,
  selectDirectChildCommentsFromParentCommentId,
} from '../services/comment.service';
import { db } from '@/configs/database.config';
import { postComments } from '@/models/schema';
import { eq } from 'drizzle-orm';

jest.setTimeout(30000);

const waitInSeconds = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ─── Constants ────────────────────────────────────────────────────────────────
const validPostId   = 1000006;
const validOwnerId  = 24;
const nonExistentId = 999999;
const sleepTime     = 7000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createComment = async (overrides = {}) => {
  const result = await insertComment({
    ownerId:  validOwnerId,
    content:  'Test comment',
    postId:   validPostId,
    ...overrides
  } as any);
  return result[0][0][0].id as number;
};


// ═══════════════════════════════════════════════════════════════════════════════
// insertComment
// ═══════════════════════════════════════════════════════════════════════════════

describe('insertComment', () => {

  afterEach(async () => {
    await db.delete(postComments).where(eq(postComments.postId, validPostId));
  });

  
  it('TCQLBL68: Insert comment hợp lệ ', async () => {
    const id = await createComment({ content: 'Noi dung test insert' });

    console.log('TCQLBL68 hoàn thành - id:', id);
    await waitInSeconds(sleepTime);

    expect(id).toBeDefined();
    expect(typeof id).toBe('number');
  });

  it('TCQLBL69: Insert comment có tags ', async () => {
    const tagData = String(validPostId);
    const id = await createComment({ content: 'Binh luan co tags', tags: tagData });

    const [record] = await db.select().from(postComments).where(eq(postComments.id, id));

    console.log('TCQLBL69 hoàn thành - tags:', record.tags);
    await waitInSeconds(sleepTime);

    expect(record.tags).toBe(tagData);
  });

  it('TCQLBL70: Insert comment con → parentCommentId được lưu đúng', async () => {
    const parentId = await createComment({ content: 'Comment cha' });
    const childId  = await createComment({ content: 'Comment con', parentCommentId: parentId });

    const [record] = await db.select().from(postComments).where(eq(postComments.id, childId));

    console.log('TCQLBL70 hoàn thành - parentId:', record.parentCommentId);
    await waitInSeconds(sleepTime);

    expect(record.parentCommentId).toBe(parentId);
  });

  it('TCQLBL71: Tạo Comment chỉ có tags, không có content ', async () => {
    const id = await createComment({  tags: String(validPostId) });

    const [record] = await db.select().from(postComments).where(eq(postComments.id, id));

    await waitInSeconds(sleepTime);

    // Document bug: content rỗng vẫn được lưu
    expect(record).toBeDefined();
    
  });

  it('TCQLBL72: content = chuỗi rỗng + có tags ', async () => {
    const id = await createComment({ content: '', tags: String(validPostId) });

    const [record] = await db.select().from(postComments).where(eq(postComments.id, id));

    await waitInSeconds(sleepTime);

    expect(record).toBeDefined();
    expect(record.content).toBe('');
  });


  it('TCQLBL73: postId là không phải là số ', async () => {
     await expect(
      insertComment({ postId: 'abc' as any, ownerId: validOwnerId, content: 'Loi logic' })
    ).rejects.toThrow();
  });



  it('TCQLBL74: postId không tồn tại ', async () => {
    await expect(
      insertComment({ ownerId: validOwnerId, content: 'Loi logic', postId: nonExistentId })
    ).rejects.toThrow();
  });

  it('TCQLBL75: Thiếu content → không insert được', async () => {
    await expect(
      insertComment({ ownerId: validOwnerId, postId: validPostId } as any)
    ).rejects.toThrow();
  });

  it('TCQLBL76: content > 1000 ký tự ', async () => {
    await expect(
      insertComment({ ownerId: validOwnerId, postId: validPostId, content: 'A'.repeat(1001) })
    ).rejects.toThrow();
  });

  it('TCQLBL77: ownerId không tồn tại ', async () => {
    await expect(
      insertComment({ ownerId: nonExistentId, postId: validPostId, content: 'Test' })
    ).rejects.toThrow();
  });

  it('TCQLBL78: parentCommentId không tồn tại → không insert được', async () => {
    await expect(
      insertComment({
        ownerId: validOwnerId,
        postId: validPostId,
        content: 'Test',
        parentCommentId: nonExistentId
      })
    ).rejects.toThrow();
  });
});


describe('selectPostLevel1Comments', () => {

  afterEach(async () => {
    await db.delete(postComments).where(eq(postComments.postId, validPostId));
  });

  it('TCQLBL79: Lấy comment cấp 1 → trả về đúng danh sách', async () => {
    await createComment({ content: 'Comment cap 1' });

    const data = await selectPostLevel1Comments(validPostId, {
      pagination: { page: 1, pageSize: 10 }
    });

    console.log('TCQLBL79 hoàn thành - số lượng:', data.length);
    await waitInSeconds(sleepTime);

    expect(data.length).toBeGreaterThan(0);
    data.forEach(c => expect(c.parentCommentId).toBeNull());
  });

  it('TCQLBL80: Comment con không xuất hiện trong danh sách cấp 1', async () => {
    const parentId = await createComment({ content: 'Comment cha' });
    await createComment({ content: 'Comment con', parentCommentId: parentId });

    const data = await selectPostLevel1Comments(validPostId, {
      pagination: { page: 1, pageSize: 10 }
    });

    await waitInSeconds(sleepTime);

    expect(data.length).toBe(1);
    expect(data[0].id).toBe(parentId);
  });

  it('TCQLBL81: postId không tồn tại → trả về mảng rỗng', async () => {
    const data = await selectPostLevel1Comments(nonExistentId, {
      pagination: { page: 1, pageSize: 5 }
    });

    expect(data.length).toBe(0);
  });

  it('TCQLBL82: Pagination hoạt động đúng → pageSize giới hạn số kết quả', async () => {
    await createComment({ content: 'Comment 1' });
    await createComment({ content: 'Comment 2' });
    await createComment({ content: 'Comment 3' });

    const data = await selectPostLevel1Comments(validPostId, {
      pagination: { page: 1, pageSize: 2 }
    });

    await waitInSeconds(sleepTime);

    expect(data.length).toBeLessThanOrEqual(2);
  });
  it('TCQLBL83: orderConditions updatedAt desc → kết quả sắp xếp đúng thứ tự', async () => {
  const id1 = await createComment({ content: 'Comment 1' });
  const id2 = await createComment({ content: 'Comment 2' });

  // Force updatedAt khác nhau rõ ràng
  await db.update(postComments)
    .set({ updatedAt: new Date('2024-01-01') })
    .where(eq(postComments.id, id1));

  await db.update(postComments)
    .set({ updatedAt: new Date('2024-01-02') })
    .where(eq(postComments.id, id2));

  const data = await selectPostLevel1Comments(validPostId, {
    orderConditions: { updatedAt: 'desc' },
    pagination: { page: 1, pageSize: 10 }
  });

  expect(data[0].id).toBe(id2); // 2024-01-02 mới hơn → lên đầu
  expect(data[1].id).toBe(id1);
});
it('TCQLBL84: orderConditions updatedAt asc → kết quả sắp xếp đúng thứ tự', async () => {
  const id1 = await createComment({ content: 'Comment 1' });
  await new Promise(r => setTimeout(r, 50));
  const id2 = await createComment({ content: 'Comment 2' });

  const data = await selectPostLevel1Comments(validPostId, {
    orderConditions: { updatedAt: 'asc' },
    pagination: { page: 1, pageSize: 10 }
  });

  expect(data[0].id).toBe(id1); // cũ nhất lên đầu
  expect(data[1].id).toBe(id2);
});

it('TCQLBL85: orderConditions = {} → không có orderBy, vẫn trả kết quả bình thường', async () => {
  await createComment({ content: 'Comment 1' });

  const data = await selectPostLevel1Comments(validPostId, {
    orderConditions: {},
    pagination: { page: 1, pageSize: 10 }
  });

  expect(data.length).toBeGreaterThan(0);
});
it('TCQLBL86: options không có pagination → dùng default page=1 pageSize=10', async () => {
  // tạo 15 comment
  for (let i = 0; i < 15; i++) {
    await createComment({ content: `Comment ${i}` });
  }

  const data = await selectPostLevel1Comments(validPostId, {
    // không truyền pagination
  });

  // default pageSize = 10 → chỉ trả 10
  expect(data.length).toBe(10);
});
});



describe('selectCommentByConditions', () => {

  afterEach(async () => {
    await db.delete(postComments).where(eq(postComments.postId, validPostId));
  });

  it('TCQLBL87: Tìm comment theo id → trả về đúng record', async () => {
    const id = await createComment({ content: 'Check tim kiem' });

    const results = await selectCommentByConditions({
      id: { operator: 'eq', value: id }
    });

    console.log('TCQLBL87 hoàn thành - id:', id);
    await waitInSeconds(sleepTime);

    expect(results.length).toBe(1);
    expect(results[0].id).toBe(id);
    expect(results[0].content).toBe('Check tim kiem');
  });

  it('TCQLBL88: Tìm comment theo postId → trả về tất cả comment của post', async () => {
    await createComment({ content: 'Comment A' });
    await createComment({ content: 'Comment B' });

    const results = await selectCommentByConditions({
      postId: { operator: 'eq', value: validPostId }
    });

    await waitInSeconds(sleepTime);

    expect(results.length).toBeGreaterThanOrEqual(2);
    results.forEach(c => expect(c.postId).toBe(validPostId));
  });

  it('TCQLBL89: id không tồn tại → trả về mảng rỗng', async () => {
    const results = await selectCommentByConditions({
      id: { operator: 'eq', value: nonExistentId }
    });

    expect(results.length).toBe(0);
  });
});


describe('selectDirectChildCommentsFromParentCommentId', () => {

  afterEach(async () => {
    await db.delete(postComments).where(eq(postComments.postId, validPostId));
  });

  it('TCQLBL90: Lấy comment con trực tiếp → trả về đúng danh sách', async () => {
    const parentId = await createComment({ content: 'Comment cha' });
    await createComment({ content: 'Comment con', parentCommentId: parentId });

    const children = await selectDirectChildCommentsFromParentCommentId(
      { parentCommentId: { operator: 'eq', value: parentId } } as any,
      { pagination: { page: 1, pageSize: 5 } }
    );

    console.log('TCQLBL90 hoàn thành - số con:', children.length);
    await waitInSeconds(sleepTime);

    expect(children.length).toBeGreaterThan(0);
  });

  it('TCQLBL91: Comment không có con → trả về mảng rỗng', async () => {
    const parentId = await createComment({ content: 'Comment không có con' });

    const children = await selectDirectChildCommentsFromParentCommentId(
      { parentCommentId: { operator: 'eq', value: parentId } } as any,
      { pagination: { page: 1, pageSize: 5 } }
    );

    expect(children.length).toBe(0);
  });

  it('TCQLBL92: Chỉ lấy con trực tiếp, không lấy cháu', async () => {
    const parentId = await createComment({ content: 'Ông' });
    const childId  = await createComment({ content: 'Con', parentCommentId: parentId });
    await createComment({ content: 'Cháu', parentCommentId: childId });

    const children = await selectDirectChildCommentsFromParentCommentId(
      { parentCommentId: { operator: 'eq', value: parentId } } as any,
      { pagination: { page: 1, pageSize: 10 } }
    );

    await waitInSeconds(sleepTime);

    expect(children.length).toBe(1);
    expect(children[0].id).toBe(childId);
  });
});



describe('updateCommentByCommentId', () => {

  afterEach(async () => {
    await db.delete(postComments).where(eq(postComments.postId, validPostId));
  });


  it('TCQLBL93: Cập nhật content → record thay đổi đúng trong DB', async () => {
    const id = await createComment({ content: 'Truoc khi sua' });

    await updateCommentByCommentId(id, { content: 'Noi dung moi sau khi update' });

    const [record] = await db.select().from(postComments).where(eq(postComments.id, id));

    console.log('TCQLBL93 hoàn thành - content mới:', record.content);
    await waitInSeconds(sleepTime);

    expect(record.content).toBe('Noi dung moi sau khi update');
  });

  it('TCQLBL94: Cập nhật tags cũ → tags mới thành công', async () => {
    const id = await createComment({ content: 'Comment co tags', tags: 'tag_cu' });

    await updateCommentByCommentId(id, { tags: 'tag_moi' });

    const [record] = await db.select().from(postComments).where(eq(postComments.id, id));

    await waitInSeconds(sleepTime);

    expect(record.tags).toBe('tag_moi');
    expect(record.tags).not.toBe('tag_cu');
  });
it('TCQLBL95: commentId không tồn tại → affectedRows = 0, không throw', async () => {
    const result = await updateCommentByCommentId(nonExistentId, { content: 'Sua linh tinh' });

    // @ts-ignore
    expect(result[0].affectedRows).toBe(0);
    console.log('TCQLBL95 hoàn thành - affectedRows: 0');
  });
  it('TCQLBL96: Cập nhật content thành rỗng ', async () => {
    const id = await createComment({ content: 'Noi dung goc' });

    await updateCommentByCommentId(id, { content: '' });

    const [record] = await db.select().from(postComments).where(eq(postComments.id, id));

    await waitInSeconds(sleepTime);

    // Document bug: content rỗng vẫn được lưu
    expect(record.content).toBe('');
  });

  
});

describe('deleteCommentByConditions', () => {

  afterEach(async () => {
    await db.delete(postComments).where(eq(postComments.postId, validPostId));
  });

  it('TCQLBL97: Xóa comment theo id → không còn trong DB', async () => {
    const id = await createComment({ content: 'Sap bi delete' });

    await deleteCommentByConditions({ id: { operator: 'eq', value: id } });

    const check = await db.select().from(postComments).where(eq(postComments.id, id));

    console.log('TCQLBL97 hoàn thành - đã xóa id:', id);
    await waitInSeconds(sleepTime);

    expect(check.length).toBe(0);
  });

  it('TCQLBL98: Xóa comment theo postId → tất cả comment của post bị xóa', async () => {
    await createComment({ content: 'Comment A' });
    await createComment({ content: 'Comment B' });

    await deleteCommentByConditions({ postId: { operator: 'eq', value: validPostId } });

    const check = await db.select().from(postComments)
      .where(eq(postComments.postId, validPostId));

    await waitInSeconds(sleepTime);

    expect(check.length).toBe(0);
  });

  it('TCQLBL99: Giá trị id sai kiểu (string) → không delete được', async () => {
    await expect(
      deleteCommentByConditions({ id: { operator: 'eq', value: 'abc' as any } })
    ).rejects.toThrow();
  });
});
