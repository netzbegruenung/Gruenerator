import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationEllipsis,
} from '@gruenerator/ui';

// PaginationEllipsis is a sub-part; the only true render is inside a pagination
// strip, where it stands in for skipped page ranges.
export function InContext() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem>
        <PaginationItem><PaginationEllipsis /></PaginationItem>
        <PaginationItem><PaginationLink href="#">7</PaginationLink></PaginationItem>
        <PaginationItem><PaginationLink href="#" isActive>8</PaginationLink></PaginationItem>
        <PaginationItem><PaginationLink href="#">9</PaginationLink></PaginationItem>
        <PaginationItem><PaginationEllipsis /></PaginationItem>
        <PaginationItem><PaginationLink href="#">24</PaginationLink></PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
